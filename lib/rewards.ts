import { getD1, nowIso } from "./server";

type RewardPolicy = {
  enabled: boolean;
  joinReward: number;
  inviterOrderReward: number;
  friendOrderReward: number;
  minOrderPoints: number;
  holdDays: number;
  cookieDays: number;
  monthlyCap: number;
  expiryDays: number;
};

const num = (value: unknown, fallback: number, max = 10_000_000) => {
  const parsed = value === undefined || value === null || value === "" ? fallback : Number(value);
  return Math.max(0, Math.min(max, Number.isFinite(parsed) ? parsed : fallback));
};

export async function getRewardPolicy(): Promise<RewardPolicy> {
  const rows = await getD1()
    .prepare(
      `SELECT key, value FROM settings WHERE key IN (
        'referral_enabled','referral_join_reward','referral_first_order_inviter_reward',
        'referral_first_order_friend_reward','referral_min_order_points',
        'referral_hold_days','referral_cookie_days','referral_monthly_cap',
        'referral_reward_expiry_days'
      )`,
    )
    .all();
  const values = Object.fromEntries(
    rows.results.map((row) => [String(row.key), String(row.value)]),
  );
  return {
    enabled: values.referral_enabled !== "false",
    joinReward: num(values.referral_join_reward, 500),
    inviterOrderReward: num(values.referral_first_order_inviter_reward, 1000),
    friendOrderReward: num(values.referral_first_order_friend_reward, 1000),
    minOrderPoints: num(values.referral_min_order_points, 30000),
    holdDays: num(values.referral_hold_days, 7, 90),
    cookieDays: num(values.referral_cookie_days, 30, 365),
    monthlyCap: num(values.referral_monthly_cap, 30000),
    expiryDays: num(values.referral_reward_expiry_days, 365, 3650),
  };
}

function codeFor(memberId: number) {
  const random = crypto.getRandomValues(new Uint8Array(3));
  const suffix = Array.from(random, (byte) => byte.toString(36)).join("").slice(0, 5);
  return `PG${memberId.toString(36).toUpperCase()}${suffix.toUpperCase()}`;
}

export async function ensureReferralCode(memberId: number) {
  const db = getD1();
  const existing = await db
    .prepare("SELECT code FROM referral_codes WHERE member_id = ?")
    .bind(memberId)
    .first<{ code: string }>();
  if (existing?.code) return existing.code;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = codeFor(memberId);
    try {
      await db
        .prepare(
          "INSERT INTO referral_codes (member_id, code, created_at) VALUES (?, ?, ?)",
        )
        .bind(memberId, code, nowIso())
        .run();
      return code;
    } catch (error) {
      if (!(error instanceof Error) || !/unique/i.test(error.message)) throw error;
    }
  }
  throw new Error("추천코드를 만들지 못했습니다.");
}

export async function recordReferralVisit(
  referralCode: string,
  visitorToken: string,
  landingPath: string,
) {
  const code = referralCode.trim().toUpperCase().slice(0, 32);
  const token = visitorToken.trim().slice(0, 100);
  if (!code || !token) return false;
  const db = getD1();
  const owner = await db
    .prepare("SELECT member_id FROM referral_codes WHERE code = ?")
    .bind(code)
    .first();
  if (!owner) return false;
  const policy = await getRewardPolicy();
  if (!policy.enabled) return false;
  const expiresAt = new Date(
    Date.now() + policy.cookieDays * 24 * 60 * 60 * 1000,
  ).toISOString();
  await db
    .prepare(
      `INSERT INTO referral_visits
        (referral_code, visitor_token, landing_path, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(code, token, landingPath.slice(0, 240) || "/", nowIso(), expiresAt)
    .run();
  return true;
}

export async function attachReferral(memberId: number, referralCode: string) {
  const code = referralCode.trim().toUpperCase().slice(0, 32);
  if (!code) return;
  const db = getD1();
  if (!(await getRewardPolicy()).enabled) return;
  const owner = await db
    .prepare("SELECT member_id FROM referral_codes WHERE code = ?")
    .bind(code)
    .first<{ member_id: number }>();
  if (!owner || Number(owner.member_id) === memberId) return;
  const policy = await getRewardPolicy();
  await db
    .prepare(
      `INSERT OR IGNORE INTO referrals
        (inviter_id, invitee_id, referral_code, status, joined_at, hold_reason, policy_json)
       VALUES (?, ?, ?, '가입완료', ?, '이메일·휴대전화 인증 대기', ?)`,
    )
    .bind(owner.member_id, memberId, code, nowIso(), JSON.stringify(policy))
    .run();
  const referral = await db
    .prepare("SELECT id, inviter_id FROM referrals WHERE invitee_id = ?")
    .bind(memberId)
    .first<{ id: number; inviter_id: number }>();
  if (!referral) return;
  const duplicatePhone = await db
    .prepare(
      `SELECT COUNT(*) AS count FROM members target
       WHERE target.id != ? AND target.phone != ''
         AND target.phone = (SELECT phone FROM members WHERE id = ?)`,
    )
    .bind(memberId, memberId)
    .first<{ count: number }>();
  const sameAsInviter = await db
    .prepare(
      `SELECT CASE WHEN invitee.phone != '' AND invitee.phone = inviter.phone THEN 1 ELSE 0 END AS same_phone
       FROM members invitee JOIN members inviter ON inviter.id = ?
       WHERE invitee.id = ?`,
    )
    .bind(referral.inviter_id, memberId)
    .first<{ same_phone: number }>();
  const reasons = [
    Number(duplicatePhone?.count ?? 0) > 0 ? "동일 휴대전화 반복 가입" : "",
    sameAsInviter?.same_phone ? "추천인과 동일 휴대전화" : "",
  ].filter(Boolean);
  if (reasons.length) {
    await db.batch([
      db
        .prepare(
          `INSERT INTO referral_flags
            (referral_id, reasons, status, created_at)
           VALUES (?, ?, '검토중', ?)`,
        )
        .bind(referral.id, reasons.join(", "), nowIso()),
      db
        .prepare(
          "UPDATE referrals SET status = '검토중', hold_reason = ? WHERE id = ?",
        )
        .bind("중복 가입 신호가 있어 관리자 확인이 필요합니다.", referral.id),
    ]);
  }
}

async function confirmEvent(event: {
  id: number;
  member_id: number;
  amount: number;
  memo: string;
}) {
  const db = getD1();
  const claimed = await db
    .prepare(
      `UPDATE reward_events SET status = 'confirmed', confirmed_at = ?
       WHERE id = ? AND status = 'pending'
         AND (expires_at IS NULL OR expires_at > ?)`,
    )
    .bind(nowIso(), event.id, nowIso())
    .run();
  if (!Number(claimed.meta.changes ?? 0)) return;
  const member = await db
    .prepare("SELECT points, reward_points, pending_reward_points FROM members WHERE id = ?")
    .bind(event.member_id)
    .first<{ points: number; reward_points: number; pending_reward_points: number }>();
  if (!member) return;
  await db.batch([
    db
      .prepare(
        `UPDATE members
         SET points = points + ?, reward_points = reward_points + ?,
             pending_reward_points = MAX(0, pending_reward_points - ?)
         WHERE id = ?`,
      )
      .bind(event.amount, event.amount, event.amount, event.member_id),
    db
      .prepare(
        `INSERT INTO point_logs
          (member_id, amount, type, memo, balance_after, created_at, point_bucket, reward_event_id)
         SELECT ?, ?, '리워드적립', ?, points, ?, 'reward', ? FROM members WHERE id = ?`,
      )
      .bind(event.member_id, event.amount, event.memo, nowIso(), event.id, event.member_id),
  ]);
  await db
    .prepare(
      `UPDATE referrals
       SET status = '지급완료', confirmed_at = ?, hold_reason = ''
       WHERE id = (SELECT referral_id FROM reward_events WHERE id = ?)
         AND first_order_id IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM reward_events pending
           WHERE pending.referral_id = referrals.id
             AND pending.source_type = 'referral_first_order'
             AND pending.status = 'pending'
         )`,
    )
    .bind(nowIso(), event.id)
    .run();
}

export async function processMatureRewardEvents() {
  const db = getD1();
  const now = nowIso();
  const expired = await db
    .prepare(
      `SELECT id, member_id, amount, status, memo FROM reward_events
       WHERE status IN ('pending','confirmed')
         AND expires_at IS NOT NULL AND expires_at <= ?
       ORDER BY id LIMIT 100`,
    )
    .bind(now)
    .all<{ id: number; member_id: number; amount: number; status: string; memo: string }>();
  for (const event of expired.results) {
    if (event.status === "pending") {
      const claimed = await db.prepare("UPDATE reward_events SET status = 'expired', revoked_at = ? WHERE id = ? AND status = 'pending'").bind(now, event.id).run();
      if (Number(claimed.meta.changes ?? 0)) {
        await db.prepare("UPDATE members SET pending_reward_points = MAX(0, pending_reward_points - ?) WHERE id = ?").bind(event.amount, event.member_id).run();
      }
      continue;
    }
    const member = await db.prepare("SELECT points, reward_points FROM members WHERE id = ?").bind(event.member_id).first<{ points: number; reward_points: number }>();
    if (!member) continue;
    const recovery = Math.min(Number(event.amount), Number(member.reward_points));
    const claimed = await db.prepare("UPDATE reward_events SET status = 'expired', revoked_at = ? WHERE id = ? AND status = 'confirmed'").bind(now, event.id).run();
    if (!Number(claimed.meta.changes ?? 0)) continue;
    if (recovery > 0) {
      const nextTotal = Math.max(0, Number(member.points) - recovery);
      await db.batch([
        db.prepare("UPDATE members SET points = ?, reward_points = MAX(0, reward_points - ?) WHERE id = ?").bind(nextTotal, recovery, event.member_id),
        db.prepare(`INSERT INTO point_logs (member_id, amount, type, memo, balance_after, created_at, point_bucket, reward_event_id) VALUES (?, ?, '리워드만료', ?, ?, ?, 'reward', ?)`).bind(event.member_id, -recovery, `${event.memo} 유효기간 만료`, nextTotal, now, event.id),
      ]);
    }
  }
  const rows = await db
    .prepare(
      `SELECT id, member_id, amount, memo FROM reward_events
       WHERE status = 'pending' AND available_at IS NOT NULL AND available_at <= ?
         AND (expires_at IS NULL OR expires_at > ?)
       ORDER BY id LIMIT 100`,
    )
    .bind(now, now)
    .all<{ id: number; member_id: number; amount: number; memo: string }>();
  for (const event of rows.results) await confirmEvent(event);
}

export async function completeReferralVerification(memberId: number) {
  const db = getD1();
  const referral = await db
    .prepare("SELECT * FROM referrals WHERE invitee_id = ?")
    .bind(memberId)
    .first<Record<string, unknown>>();
  if (!referral || referral.verified_at) return;
  const openFlag = await db
    .prepare(
      "SELECT id FROM referral_flags WHERE referral_id = ? AND status = '검토중' LIMIT 1",
    )
    .bind(Number(referral.id))
    .first();
  if (openFlag) return;
  const member = await db
    .prepare("SELECT email_verified, phone_verified FROM members WHERE id = ?")
    .bind(memberId)
    .first<{ email_verified: number; phone_verified: number }>();
  if (!member?.email_verified || !member?.phone_verified) return;
  const policy = await getRewardPolicy();
  if (!policy.enabled) return;
  const now = nowIso();
  const expiresAt = new Date(Date.now() + policy.expiryDays * 86400000).toISOString();
  const inserted = await db
    .prepare(
      `INSERT OR IGNORE INTO reward_events
        (member_id, referral_id, source_type, beneficiary_role, amount, status,
         available_at, expires_at, memo, policy_json, created_at)
       VALUES (?, ?, 'referral_join', 'friend', ?, 'pending', ?, ?, ?, ?, ?)`,
    )
    .bind(
      memberId,
      Number(referral.id),
      policy.joinReward,
      now,
      expiresAt,
      "친구추천 가입 인증 보상",
      JSON.stringify(policy),
      now,
    )
    .run();
  const changes = Number(inserted.meta.changes ?? 0);
  await db.batch([
    db
      .prepare(
        `UPDATE referrals
         SET status = '첫 구매 대기', verified_at = ?, hold_reason = ''
         WHERE id = ?`,
      )
      .bind(now, Number(referral.id)),
    ...(changes
      ? [
          db
            .prepare(
              "UPDATE members SET pending_reward_points = pending_reward_points + ? WHERE id = ?",
            )
            .bind(policy.joinReward, memberId),
        ]
      : []),
  ]);
  await processMatureRewardEvents();
}

export async function scheduleFirstPurchaseRewards(orderId: number) {
  const db = getD1();
  const order = await db
    .prepare(
      `SELECT o.*, r.id AS referral_id, r.inviter_id, r.invitee_id,
              r.first_order_id, r.policy_json
       FROM orders o JOIN referrals r ON r.invitee_id = o.member_id
       WHERE o.id = ?`,
    )
    .bind(orderId)
    .first<Record<string, unknown>>();
  if (!order || order.first_order_id) return;
  const currentPolicy = await getRewardPolicy();
  if (!currentPolicy.enabled) return;
  let policy = currentPolicy;
  try {
    const saved = JSON.parse(String(order.policy_json || "{}"));
    policy = { ...currentPolicy, ...saved };
  } catch {
    policy = currentPolicy;
  }
  if (Number(order.total_points) < policy.minOrderPoints) return;
  const earlier = await db
    .prepare(
      `SELECT id FROM orders
       WHERE member_id = ? AND id != ? AND status = '배송완료'
         AND total_points >= ? LIMIT 1`,
    )
    .bind(Number(order.invitee_id), orderId, policy.minOrderPoints)
    .first();
  if (earlier) return;
  const now = nowIso();
  const availableAt = new Date(Date.now() + policy.holdDays * 86400000).toISOString();
  const expiresAt = new Date(Date.now() + policy.expiryDays * 86400000).toISOString();
  const referralId = Number(order.referral_id);
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const currentMonth = await db
    .prepare(
      `SELECT COALESCE(SUM(amount), 0) AS amount FROM reward_events
       WHERE member_id = ? AND beneficiary_role = 'inviter'
         AND status IN ('pending','confirmed') AND created_at >= ?`,
    )
    .bind(Number(order.inviter_id), monthStart.toISOString())
    .first<{ amount: number }>();
  const inviterAmount = Math.max(
    0,
    Math.min(policy.inviterOrderReward, policy.monthlyCap - Number(currentMonth?.amount ?? 0)),
  );
  const events = [
    { memberId: Number(order.invitee_id), role: "friend", amount: policy.friendOrderReward, memo: "친구추천 첫 구매 보상" },
    { memberId: Number(order.inviter_id), role: "inviter", amount: inviterAmount, memo: "추천 친구 첫 구매 보상" },
  ].filter((event) => event.amount > 0);
  const claimed = await db
    .prepare(
      `UPDATE referrals SET status = '지급 대기', first_order_id = ?,
       eligible_at = ?, hold_reason = '반품 가능 기간 확인 중'
       WHERE id = ? AND first_order_id IS NULL`,
    )
    .bind(orderId, availableAt, referralId)
    .run();
  if (!Number(claimed.meta.changes ?? 0)) return;
  for (const event of events) {
    const inserted = await db
      .prepare(
        `INSERT OR IGNORE INTO reward_events
          (member_id, referral_id, order_id, source_type, beneficiary_role,
           amount, status, available_at, expires_at, memo, policy_json, created_at)
         VALUES (?, ?, ?, 'referral_first_order', ?, ?, 'pending', ?, ?, ?, ?, ?)`,
      )
      .bind(event.memberId, referralId, orderId, event.role, event.amount, availableAt, expiresAt, event.memo, JSON.stringify(policy), now)
      .run();
    if (Number(inserted.meta.changes ?? 0)) {
      await db.prepare("UPDATE members SET pending_reward_points = pending_reward_points + ? WHERE id = ?").bind(event.amount, event.memberId).run();
    }
  }
}

export async function revokeReferralOrderRewards(orderId: number, reason: string) {
  const db = getD1();
  const events = await db
    .prepare(
      `SELECT * FROM reward_events
       WHERE order_id = ? AND source_type = 'referral_first_order'
         AND status IN ('pending','confirmed')`,
    )
    .bind(orderId)
    .all<Record<string, unknown>>();
  for (const event of events.results) {
    const member = await db
      .prepare("SELECT points, reward_points, pending_reward_points FROM members WHERE id = ?")
      .bind(Number(event.member_id))
      .first<{ points: number; reward_points: number; pending_reward_points: number }>();
    if (!member) continue;
    const amount = Number(event.amount);
    if (event.status === "confirmed") {
      const recovery = Math.min(amount, Number(member.reward_points));
      const nextTotal = Math.max(0, Number(member.points) - recovery);
      await db.batch([
        db.prepare("UPDATE reward_events SET status = 'revoked', revoked_at = ? WHERE id = ?").bind(nowIso(), Number(event.id)),
        db.prepare("UPDATE members SET points = ?, reward_points = MAX(0, reward_points - ?) WHERE id = ?").bind(nextTotal, recovery, Number(event.member_id)),
        db.prepare(`INSERT INTO point_logs (member_id, amount, type, memo, balance_after, created_at, point_bucket, reward_event_id) VALUES (?, ?, '리워드회수', ?, ?, ?, 'reward', ?)`).bind(Number(event.member_id), -recovery, reason, nextTotal, nowIso(), Number(event.id)),
      ]);
    } else {
      await db.batch([
        db.prepare("UPDATE reward_events SET status = 'revoked', revoked_at = ? WHERE id = ?").bind(nowIso(), Number(event.id)),
        db.prepare("UPDATE members SET pending_reward_points = MAX(0, pending_reward_points - ?) WHERE id = ?").bind(amount, Number(event.member_id)),
      ]);
    }
  }
  await db
    .prepare("UPDATE referrals SET status = '취소', canceled_at = ?, hold_reason = ? WHERE first_order_id = ?")
    .bind(nowIso(), reason, orderId)
    .run();
}

export async function getRewardCenter(memberId: number, siteUrl: string) {
  await processMatureRewardEvents();
  const db = getD1();
  const code = await ensureReferralCode(memberId);
  const [member, referrals, events, visitCount] = await Promise.all([
    db.prepare("SELECT charge_points, reward_points, pending_reward_points FROM members WHERE id = ?").bind(memberId).first(),
    db.prepare(`SELECT r.*, m.name AS invitee_name FROM referrals r JOIN members m ON m.id = r.invitee_id WHERE r.inviter_id = ? ORDER BY r.id DESC LIMIT 100`).bind(memberId).all(),
    db.prepare("SELECT * FROM reward_events WHERE member_id = ? ORDER BY id DESC LIMIT 100").bind(memberId).all(),
    db.prepare("SELECT COUNT(*) AS count FROM referral_visits WHERE referral_code = ?").bind(code).first<{ count: number }>(),
  ]);
  const masked = referrals.results.map((row) => {
    const name = String(row.invitee_name || "회원");
    return { ...row, invitee_name: `${name.slice(0, 1)}○${name.length > 2 ? name.slice(-1) : ""}` };
  });
  const confirmed = events.results.filter((row) => row.status === "confirmed");
  const now = new Date();
  const monthTotal = confirmed
    .filter((row) => {
      const date = new Date(String(row.confirmed_at || row.created_at));
      return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
    })
    .reduce((sum, row) => sum + Number(row.amount), 0);
  return {
    code,
    url: `${siteUrl.replace(/\/$/, "")}/register?ref=${encodeURIComponent(code)}`,
    balances: {
      charge: Number(member?.charge_points ?? 0),
      reward: Number(member?.reward_points ?? 0),
      pending: Number(member?.pending_reward_points ?? 0),
    },
    stats: {
      visits: Number(visitCount?.count ?? 0),
      joined: masked.length,
      firstPurchased: masked.filter((row) => row.first_order_id).length,
      confirmed: masked.filter((row) => row.status === "지급완료").length,
      monthEarned: monthTotal,
      totalEarned: confirmed.reduce((sum, row) => sum + Number(row.amount), 0),
    },
    referrals: masked,
    events: events.results,
    policy: await getRewardPolicy(),
  };
}
