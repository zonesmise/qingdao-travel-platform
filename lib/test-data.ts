import { hashAdminPassword } from "./admin-auth";
import { getD1, nowIso } from "./server";

export const TEST_MEMBER_PASSWORD = "RewardV2!2026";
export const TEST_DATA_VERSION = "7";

const testMembers = [
  ["테스트 신규회원", "가입만 완료"],
  ["테스트 출석회원", "출석체크 1회"],
  ["테스트 연속출석", "7일 연속 출석"],
  ["테스트 리워드회원", "혜택 리워드 보유"],
  ["테스트 무통장대기", "무통장입금 대기"],
  ["테스트 카톡송금대기", "카카오톡 송금 대기"],
  ["테스트 주문접수", "리워드 주문 접수"],
  ["테스트 상품준비", "혼합결제 상품준비"],
  ["테스트 배송중", "배송중"],
  ["테스트 구매완료", "배송완료·후기 작성"],
  ["테스트 주문취소", "주문 취소·리워드 복원"],
  ["테스트 반품회원", "반품완료·환불"],
  ["테스트 추천대기", "추천 보상 지급 대기"],
  ["테스트 추천완료", "추천 보상 지급 완료"],
  ["테스트 추천검토", "의심 추천 검토"],
] as const;

const isoDaysAgo = (days: number, hour = 3) => {
  const date = new Date(Date.now() - days * 86_400_000);
  date.setUTCHours(hour, 0, 0, 0);
  return date.toISOString();
};

async function removeTestData() {
  const db = getD1();
  await db.batch([
    db.prepare("DELETE FROM member_sessions WHERE member_id IN (SELECT member_id FROM test_data_members)"),
    db.prepare("DELETE FROM member_credentials WHERE member_id IN (SELECT member_id FROM test_data_members)"),
    db.prepare("DELETE FROM member_identities WHERE member_id IN (SELECT member_id FROM test_data_members)"),
    db.prepare("DELETE FROM carts WHERE member_id IN (SELECT member_id FROM test_data_members)"),
    db.prepare("DELETE FROM wishlists WHERE member_id IN (SELECT member_id FROM test_data_members)"),
    db.prepare("DELETE FROM shipping_addresses WHERE member_id IN (SELECT member_id FROM test_data_members)"),
    db.prepare("DELETE FROM attendance_records WHERE member_id IN (SELECT member_id FROM test_data_members)"),
    db.prepare("DELETE FROM finance_requests WHERE member_id IN (SELECT member_id FROM test_data_members)"),
    db.prepare("DELETE FROM inquiries WHERE member_id IN (SELECT member_id FROM test_data_members)"),
    db.prepare("DELETE FROM point_logs WHERE member_id IN (SELECT member_id FROM test_data_members)"),
    db.prepare("DELETE FROM referral_flags WHERE referral_id IN (SELECT id FROM referrals WHERE inviter_id IN (SELECT member_id FROM test_data_members) OR invitee_id IN (SELECT member_id FROM test_data_members))"),
    db.prepare("DELETE FROM reward_events WHERE member_id IN (SELECT member_id FROM test_data_members) OR referral_id IN (SELECT id FROM referrals WHERE inviter_id IN (SELECT member_id FROM test_data_members) OR invitee_id IN (SELECT member_id FROM test_data_members))"),
    db.prepare("DELETE FROM referrals WHERE inviter_id IN (SELECT member_id FROM test_data_members) OR invitee_id IN (SELECT member_id FROM test_data_members)"),
    db.prepare("DELETE FROM referral_visits WHERE referral_code IN (SELECT code FROM referral_codes WHERE member_id IN (SELECT member_id FROM test_data_members))"),
    db.prepare("DELETE FROM referral_codes WHERE member_id IN (SELECT member_id FROM test_data_members)"),
    db.prepare("DELETE FROM reviews WHERE member_id IN (SELECT member_id FROM test_data_members) OR order_id IN (SELECT id FROM orders WHERE member_id IN (SELECT member_id FROM test_data_members))"),
    db.prepare("DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE member_id IN (SELECT member_id FROM test_data_members))"),
    db.prepare("DELETE FROM orders WHERE member_id IN (SELECT member_id FROM test_data_members)"),
    db.prepare("UPDATE coupons SET used_by = NULL, used_at = NULL, status = '미사용' WHERE used_by IN (SELECT member_id FROM test_data_members)"),
    db.prepare("DELETE FROM members WHERE id IN (SELECT member_id FROM test_data_members)"),
    db.prepare("DELETE FROM test_data_members"),
  ]);
}

async function addOrder(input: {
  memberId: number;
  memberName: string;
  product: { id: number; name: string; point_price: number };
  sequence: number;
  status: string;
  paymentMethod: "points" | "cash" | "mixed";
  paymentStatus: string;
  channel?: string;
  usedPoints?: number;
  cashAmount?: number;
  reservation?: string;
  createdDaysAgo: number;
  deliveredDaysAgo?: number;
  courier?: string;
  trackingNo?: string;
}) {
  const db = getD1();
  const total = Number(input.product.point_price);
  const used = Math.min(total, Number(input.usedPoints ?? (input.paymentMethod === "points" ? total : 0)));
  const cash = Number(input.cashAmount ?? Math.max(0, total - used));
  const createdAt = isoDaysAgo(input.createdDaysAgo);
  const deliveredAt = input.deliveredDaysAgo === undefined ? null : isoDaysAgo(input.deliveredDaysAgo, 6);
  const orderNo = `TEST-${String(input.sequence).padStart(4, "0")}`;
  const result = await db.prepare(
    `INSERT INTO orders
      (order_no, member_id, total_points, used_charge_points, used_reward_points,
       payment_method, cash_payment_channel, payment_status, cash_amount,
       purchase_reward_points, purchase_reward_status, point_reservation_status,
       payment_expires_at, payment_confirmed_at, status, recipient, phone, address,
       memo, postal_code, address1, address_detail, courier, tracking_no,
       shipped_at, delivered_at, created_at)
     VALUES (?, ?, ?, 0, ?, ?, ?, ?, ?, 0, 'none', ?, ?, ?, ?, ?, ?, ?,
       '테스트 주문 데이터', '04524', '서울특별시 중구 세종대로 110', '테스트동 101호',
       ?, ?, ?, ?, ?)`,
  ).bind(
    orderNo,
    input.memberId,
    total,
    used,
    input.paymentMethod,
    input.channel ?? "",
    input.paymentStatus,
    cash,
    input.reservation ?? "captured",
    input.reservation === "reserved" ? isoDaysAgo(-1) : null,
    ["confirmed", "paid", "refunded", "canceled"].includes(input.paymentStatus) ? createdAt : null,
    input.status,
    input.memberName,
    "010-0000-0000",
    "서울특별시 중구 세종대로 110 테스트동 101호",
    input.courier ?? "",
    input.trackingNo ?? "",
    input.trackingNo ? isoDaysAgo(Math.max(0, input.createdDaysAgo - 1), 5) : null,
    deliveredAt,
    createdAt,
  ).run();
  const orderId = Number(result.meta.last_row_id);
  const item = await db.prepare(
    `INSERT INTO order_items
      (order_id, product_id, product_name, point_price, selected_options, quantity)
     VALUES (?, ?, ?, ?, '{}', 1)`,
  ).bind(orderId, input.product.id, input.product.name, total).run();
  return { orderId, itemId: Number(item.meta.last_row_id), orderNo };
}

export async function seedTestData(options: { replace?: boolean } = {}) {
  const db = getD1();
  if (options.replace) await removeTestData();
  const existing = await db.prepare("SELECT COUNT(*) AS count FROM test_data_members").first<{ count: number }>();
  if (Number(existing?.count || 0) > 0) return getTestDataSummary();

  const products = await db.prepare(
    "SELECT id, name, point_price FROM products WHERE status = 'active' ORDER BY id LIMIT 10",
  ).all<{ id: number; name: string; point_price: number }>();
  if (products.results.length < 3) throw new Error("테스트 주문에 사용할 상품이 부족합니다.");

  const passwordHash = await hashAdminPassword(TEST_MEMBER_PASSWORD);
  const memberIds: number[] = [];
  for (let index = 0; index < testMembers.length; index += 1) {
    const [name, scenario] = testMembers[index];
    const rewardPoints = [0, 100, 1200, 50000, 30000, 25000, 20000, 35000, 18000, 46000, 28000, 42000, 1000, 7200, 500][index];
    const pendingPoints = index === 12 ? 2000 : index === 14 ? 1000 : 0;
    const joinedAt = isoDaysAgo(35 - index * 2);
    const inserted = await db.prepare(
      `INSERT INTO members
        (email, name, role, status, points, charge_points, reward_points,
         pending_reward_points, email_verified, phone_verified, phone, joined_at)
       VALUES (?, ?, 'member', 'active', ?, 0, ?, ?, 1, 1, ?, ?)`,
    ).bind(
      `test${String(index + 1).padStart(2, "0")}@reward-v2.test`,
      name,
      rewardPoints,
      rewardPoints,
      pendingPoints,
      `010-9000-${String(index + 1).padStart(4, "0")}`,
      joinedAt,
    ).run();
    const memberId = Number(inserted.meta.last_row_id);
    memberIds.push(memberId);
    await db.batch([
      db.prepare("INSERT INTO member_credentials (member_id, password_hash, failed_attempts, locked_until, updated_at) VALUES (?, ?, 0, NULL, ?)").bind(memberId, passwordHash, joinedAt),
      db.prepare("INSERT INTO test_data_members (member_id, scenario, created_at) VALUES (?, ?, ?)").bind(memberId, scenario, nowIso()),
      db.prepare("INSERT INTO referral_codes (member_id, code, created_at) VALUES (?, ?, ?)").bind(memberId, `TEST${String(index + 1).padStart(3, "0")}`, joinedAt),
      db.prepare("INSERT INTO shipping_addresses (member_id, label, recipient, phone, postal_code, address1, address_detail, delivery_request, is_default, created_at, updated_at) VALUES (?, '기본 배송지', ?, ?, '04524', '서울특별시 중구 세종대로 110', '테스트동 101호', '문 앞에 놓아주세요', 1, ?, ?)").bind(memberId, name, `010-9000-${String(index + 1).padStart(4, "0")}`, joinedAt, joinedAt),
      ...(rewardPoints > 0 ? [db.prepare("INSERT INTO point_logs (member_id, amount, type, memo, balance_after, created_at, point_bucket) VALUES (?, ?, '지급', ?, ?, ?, 'reward')").bind(memberId, rewardPoints, `[테스트] ${scenario}`, rewardPoints, joinedAt)] : []),
    ]);
  }

  await db.prepare(
    "INSERT INTO attendance_records (member_id, attendance_date, streak, base_points, bonus_points, total_points, created_at) VALUES (?, ?, 1, 100, 0, 100, ?)",
  ).bind(memberIds[1], isoDaysAgo(0).slice(0, 10), isoDaysAgo(0)).run();
  for (let offset = 6; offset >= 0; offset -= 1) {
    const streak = 7 - offset;
    const attendanceDate = isoDaysAgo(offset).slice(0, 10);
    const totalPoints = streak === 7 ? 600 : 100;
    await db.prepare(
      "INSERT INTO attendance_records (member_id, attendance_date, streak, base_points, bonus_points, total_points, created_at) VALUES (?, ?, ?, 100, ?, ?, ?)",
    ).bind(memberIds[2], attendanceDate, streak, streak === 7 ? 500 : 0, totalPoints, isoDaysAgo(offset)).run();
  }

  const orderSpecs = [
    { member: 4, status: "결제확인대기", method: "mixed", payment: "awaiting_cash", channel: "bank_transfer", used: 20000, reservation: "reserved", days: 0 },
    { member: 5, status: "결제확인대기", method: "cash", payment: "awaiting_kakao", channel: "kakao_transfer", used: 0, reservation: "reserved", days: 1 },
    { member: 6, status: "접수", method: "points", payment: "paid", used: 20000, reservation: "captured", days: 2 },
    { member: 7, status: "상품준비", method: "mixed", payment: "confirmed", channel: "bank_transfer", used: 25000, reservation: "captured", days: 3 },
    { member: 8, status: "배송중", method: "mixed", payment: "confirmed", channel: "kakao_transfer", used: 18000, reservation: "captured", days: 5, courier: "CJ대한통운", tracking: "TEST123456789" },
    { member: 9, status: "배송완료", method: "points", payment: "paid", used: 30000, reservation: "captured", days: 12, delivered: 8, courier: "한진택배", tracking: "TEST987654321" },
    { member: 10, status: "취소", method: "mixed", payment: "canceled", channel: "bank_transfer", used: 15000, reservation: "captured_refunded", days: 10 },
    { member: 11, status: "반품완료", method: "mixed", payment: "refunded", channel: "kakao_transfer", used: 18000, reservation: "captured_refunded", days: 18, delivered: 13, courier: "롯데택배", tracking: "TEST555666777" },
    { member: 12, status: "배송완료", method: "mixed", payment: "confirmed", channel: "bank_transfer", used: 1000, reservation: "captured", days: 16, delivered: 9, courier: "우체국택배", tracking: "TEST111222333" },
    { member: 13, status: "배송완료", method: "points", payment: "paid", used: 7200, reservation: "captured", days: 25, delivered: 18, courier: "CJ대한통운", tracking: "TEST444555666" },
  ] as const;
  const orders: Array<{ orderId: number; itemId: number; orderNo: string }> = [];
  for (let index = 0; index < orderSpecs.length; index += 1) {
    const spec = orderSpecs[index];
    const product = products.results[index % products.results.length];
    orders.push(await addOrder({
      memberId: memberIds[spec.member], memberName: testMembers[spec.member][0], product, sequence: index + 1,
      status: spec.status, paymentMethod: spec.method, paymentStatus: spec.payment,
      channel: "channel" in spec ? spec.channel : "", usedPoints: spec.used,
      reservation: spec.reservation,
      createdDaysAgo: spec.days, deliveredDaysAgo: "delivered" in spec ? spec.delivered : undefined,
      courier: "courier" in spec ? spec.courier : "", trackingNo: "tracking" in spec ? spec.tracking : "",
    }));
  }

  const reviewOrder = orders[5];
  await db.batch([
    db.prepare("INSERT INTO reviews (member_id, product_id, order_id, order_item_id, rating, title, content, image_urls, visible, reward_points, reward_status, rewarded_at, admin_reply, answered_at, hidden_reason, created_at) VALUES (?, ?, ?, ?, 5, '[TEST] 배송도 빠르고 만족합니다', '리워드와 현금을 함께 써서 부담 없이 구매했습니다. 포장 상태도 좋아서 테스트 운영 흐름을 확인하기 좋았습니다.', '[]', 0, 300, '지급', ?, '소중한 후기 감사합니다.', ?, '테스트 데이터: 공개 상품후기에서 숨김', ?)").bind(memberIds[9], products.results[5].id, reviewOrder.orderId, reviewOrder.itemId, isoDaysAgo(7), isoDaysAgo(6), isoDaysAgo(7)),
    db.prepare("INSERT INTO inquiries (member_id, product_id, category, title, content, answer, status, created_at, answered_at) VALUES (?, ?, '배송문의', '배송은 언제 시작되나요?', '입금 확인 후 배송 시작 시점을 알고 싶습니다.', '', '접수', ?, NULL)").bind(memberIds[4], products.results[0].id, isoDaysAgo(1)),
    db.prepare("INSERT INTO inquiries (member_id, product_id, category, title, content, answer, status, created_at, answered_at) VALUES (?, ?, '반품문의', '반품 리워드는 언제 복원되나요?', '반품완료 뒤 리워드 복원 시점을 확인하고 싶습니다.', '반품완료 처리와 동시에 사용 리워드가 복원됩니다.', '답변완료', ?, ?)").bind(memberIds[11], products.results[1].id, isoDaysAgo(12), isoDaysAgo(11)),
    db.prepare("INSERT INTO carts (member_id, product_id, selected_options, quantity, created_at) VALUES (?, ?, '{}', 1, ?)").bind(memberIds[0], products.results[2].id, isoDaysAgo(0)),
    db.prepare("INSERT INTO wishlists (member_id, product_id, created_at) VALUES (?, ?, ?)").bind(memberIds[3], products.results[3].id, isoDaysAgo(2)),
  ]);

  const referralPolicy = JSON.stringify({ joinReward: 500, inviterReward: 1000, friendReward: 1000, holdDays: 7 });
  const pendingReferral = await db.prepare("INSERT INTO referrals (inviter_id, invitee_id, referral_code, status, joined_at, verified_at, first_order_id, eligible_at, hold_reason, policy_json) VALUES (?, ?, 'TEST013', '지급대기', ?, ?, ?, ?, '반품 가능 기간 종료 대기', ?)").bind(memberIds[12], memberIds[0], isoDaysAgo(8), isoDaysAgo(8), orders[8].orderId, isoDaysAgo(-1), referralPolicy).run();
  const completeReferral = await db.prepare("INSERT INTO referrals (inviter_id, invitee_id, referral_code, status, joined_at, verified_at, first_order_id, eligible_at, confirmed_at, policy_json) VALUES (?, ?, 'TEST014', '지급완료', ?, ?, ?, ?, ?, ?)").bind(memberIds[13], memberIds[1], isoDaysAgo(25), isoDaysAgo(25), orders[9].orderId, isoDaysAgo(18), isoDaysAgo(17), referralPolicy).run();
  const flaggedReferral = await db.prepare("INSERT INTO referrals (inviter_id, invitee_id, referral_code, status, joined_at, verified_at, hold_reason, policy_json) VALUES (?, ?, 'TEST015', '검토중', ?, ?, '동일 기기·배송지 반복 감지', ?)").bind(memberIds[14], memberIds[2], isoDaysAgo(2), isoDaysAgo(2), referralPolicy).run();
  await db.batch([
    db.prepare("INSERT INTO reward_events (member_id, referral_id, order_id, source_type, beneficiary_role, amount, status, available_at, memo, policy_json, created_at) VALUES (?, ?, ?, 'first_order', 'inviter', 1000, 'pending', ?, '추천 첫 구매 보상 지급 대기', ?, ?)").bind(memberIds[12], Number(pendingReferral.meta.last_row_id), orders[8].orderId, isoDaysAgo(-1), referralPolicy, isoDaysAgo(8)),
    db.prepare("INSERT INTO reward_events (member_id, referral_id, order_id, source_type, beneficiary_role, amount, status, available_at, memo, policy_json, created_at, confirmed_at) VALUES (?, ?, ?, 'first_order', 'inviter', 1000, 'confirmed', ?, '추천 첫 구매 보상 지급 완료', ?, ?, ?)").bind(memberIds[13], Number(completeReferral.meta.last_row_id), orders[9].orderId, isoDaysAgo(18), referralPolicy, isoDaysAgo(25), isoDaysAgo(17)),
    db.prepare("INSERT INTO referral_flags (referral_id, reasons, status, admin_note, created_at) VALUES (?, '동일 기기·배송지·연락처 패턴 중복', '검토중', '', ?)").bind(Number(flaggedReferral.meta.last_row_id), isoDaysAgo(2)),
    db.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('test_data_seed_version', ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at").bind(TEST_DATA_VERSION, nowIso()),
  ]);
  return getTestDataSummary();
}

export async function resetTestData() {
  await removeTestData();
  return getTestDataSummary();
}

export async function ensureInitialTestData() {
  const db = getD1();
  const state = await db.prepare("SELECT value FROM settings WHERE key = 'test_data_seed_version'").first<{ value: string }>();
  if (state?.value === TEST_DATA_VERSION) return;
  const existing = await db.prepare("SELECT COUNT(*) AS count FROM test_data_members").first<{ count: number }>();
  await seedTestData({ replace: Number(existing?.count || 0) > 0 });
}

export async function getTestDataSummary() {
  const db = getD1();
  const [members, orders, reviews, attendance, created] = await Promise.all([
    db.prepare("SELECT COUNT(*) AS count FROM test_data_members").first<{ count: number }>(),
    db.prepare("SELECT COUNT(*) AS count FROM orders WHERE member_id IN (SELECT member_id FROM test_data_members)").first<{ count: number }>(),
    db.prepare("SELECT COUNT(*) AS count FROM reviews WHERE member_id IN (SELECT member_id FROM test_data_members)").first<{ count: number }>(),
    db.prepare("SELECT COUNT(*) AS count FROM attendance_records WHERE member_id IN (SELECT member_id FROM test_data_members)").first<{ count: number }>(),
    db.prepare("SELECT MAX(created_at) AS created_at FROM test_data_members").first<{ created_at: string | null }>(),
  ]);
  return {
    members: Number(members?.count || 0), orders: Number(orders?.count || 0),
    reviews: Number(reviews?.count || 0), attendance: Number(attendance?.count || 0),
    createdAt: created?.created_at ?? null,
  };
}
