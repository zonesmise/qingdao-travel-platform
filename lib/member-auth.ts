import { getD1, nowIso } from "./server";
import {
  hashAdminPassword,
  verifyAdminPassword,
  validateAdminPassword,
} from "./admin-auth";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { attachReferral, completeReferralVerification, ensureReferralCode } from "./rewards";

export const MEMBER_SESSION_COOKIE = "point_mall_member_session";
export const MEMBER_EMBEDDED_SESSION_COOKIE =
  "point_mall_member_session_embedded";
const SESSION_SECONDS = 60 * 60 * 24 * 30;
const SESSION_RENEWAL_WINDOW_SECONDS = 60 * 60 * 24 * 15;
const GOOGLE_JWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/oauth2/v3/certs"),
);

type MemberRow = {
  id: number;
  email: string;
  name: string;
  role: string;
  status: string;
  points: number;
  charge_points: number;
  reward_points: number;
  pending_reward_points: number;
  email_verified: number;
  phone_verified: number;
  phone: string;
  joined_at: string;
};

function bytesToBase64(bytes: Uint8Array) {
  let value = "";
  for (const byte of bytes) value += String.fromCharCode(byte);
  return btoa(value);
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return bytesToBase64(new Uint8Array(digest));
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return bytesToBase64(bytes)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function readCookie(headers: Headers, name: string) {
  const cookies = headers.get("cookie") ?? "";
  for (const part of cookies.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return "";
}

function isLocalRequest(request: Request) {
  const hostname = new URL(request.url).hostname;
  return (
    hostname === "terminal.local" ||
    hostname === "localhost" ||
    hostname === "127.0.0.1"
  );
}

function sessionCookies(token: string, request: Request, maxAge = SESSION_SECONDS) {
  const encoded = encodeURIComponent(token);
  const expires =
    maxAge === 0 ? "; Expires=Thu, 01 Jan 1970 00:00:00 GMT" : "";
  if (isLocalRequest(request)) {
    return [
      `${MEMBER_SESSION_COOKIE}=${encoded}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${expires}`,
      `${MEMBER_EMBEDDED_SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`,
    ];
  }
  return [
    `${MEMBER_SESSION_COOKIE}=${encoded}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${expires}; Secure; Priority=High`,
    `${MEMBER_EMBEDDED_SESSION_COOKIE}=${encoded}; Path=/; HttpOnly; SameSite=None; Max-Age=${maxAge}${expires}; Secure; Priority=High; Partitioned`,
  ];
}

export type NativeMemberSession = {
  member: MemberRow;
  token: string;
  expiresAt: string;
};

export function validateMemberEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 160;
}

export function validateMemberPassword(password: string) {
  return validateAdminPassword(password);
}

export async function createMemberSession(memberId: number, request: Request) {
  const token = randomToken();
  const sessionHash = await sha256(token);
  const now = nowIso();
  const expiresAt = new Date(Date.now() + SESSION_SECONDS * 1000).toISOString();
  const db = getD1();
  await db.batch([
    db.prepare("DELETE FROM member_sessions WHERE expires_at <= ?").bind(now),
    db
      .prepare(
        `INSERT INTO member_sessions
          (session_hash, member_id, expires_at, created_at)
         VALUES (?, ?, ?, ?)`,
      )
      .bind(sessionHash, memberId, expiresAt, now),
  ]);
  return sessionCookies(token, request);
}

export async function createSupervisorMemberSession(
  adminId: number,
  name: string,
  request: Request,
) {
  const db = getD1();
  const email = `supervisor-${adminId}@point-mall.local`;
  const now = nowIso();
  await db
    .prepare(
      `INSERT OR IGNORE INTO members
        (email, name, role, status, points, charge_points, reward_points,
         pending_reward_points, email_verified, phone_verified, phone, joined_at)
       VALUES (?, ?, 'member', 'active', 0, 0, 0, 0, 1, 1, '', ?)`,
    )
    .bind(email, name || "슈퍼바이저", now)
    .run();
  await db
    .prepare("UPDATE members SET name = ?, status = 'active' WHERE email = ?")
    .bind(name || "슈퍼바이저", email)
    .run();
  const member = await db
    .prepare("SELECT id FROM members WHERE email = ?")
    .bind(email)
    .first<{ id: number }>();
  if (!member) throw new Error("슈퍼바이저 회원 화면을 준비하지 못했습니다.");
  return createMemberSession(member.id, request);
}

export async function getNativeMemberSessionFromHeaders(
  headers: Headers,
): Promise<NativeMemberSession | null> {
  const tokens = Array.from(
    new Set(
      [
        readCookie(headers, MEMBER_SESSION_COOKIE),
        readCookie(headers, MEMBER_EMBEDDED_SESSION_COOKIE),
      ].filter(Boolean),
    ),
  );
  for (const token of tokens) {
    const row = await getD1()
      .prepare(
        `SELECT m.*, s.expires_at AS session_expires_at
         FROM member_sessions s
         JOIN members m ON m.id = s.member_id
         WHERE s.session_hash = ?
           AND s.expires_at > ?
           AND m.status = 'active'`,
      )
      .bind(await sha256(token), nowIso())
      .first<MemberRow & { session_expires_at: string }>();
    if (row) {
      const { session_expires_at: expiresAt, ...member } = row;
      return { member, token, expiresAt };
    }
  }
  return null;
}

export async function getNativeMemberFromHeaders(headers: Headers) {
  return (await getNativeMemberSessionFromHeaders(headers))?.member ?? null;
}

export async function renewMemberSessionIfNeeded(
  session: NativeMemberSession,
  request: Request,
) {
  const remainingSeconds =
    (new Date(session.expiresAt).getTime() - Date.now()) / 1000;
  if (remainingSeconds > SESSION_RENEWAL_WINDOW_SECONDS) return [];

  const nextExpiresAt = new Date(
    Date.now() + SESSION_SECONDS * 1000,
  ).toISOString();
  await getD1()
    .prepare(
      `UPDATE member_sessions
       SET expires_at = ?
       WHERE session_hash = ? AND member_id = ?`,
    )
    .bind(nextExpiresAt, await sha256(session.token), session.member.id)
    .run();
  return sessionCookies(session.token, request);
}

export async function registerMember(
  input: {
    email: string;
    name: string;
    phone: string;
    password: string;
    passwordConfirmation: string;
    signupCode: string;
    referralCode?: string;
    termsAccepted?: boolean;
    privacyAccepted?: boolean;
  },
  request: Request,
) {
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();
  const phone = input.phone.trim();
  if (!validateMemberEmail(email)) {
    return { ok: false as const, status: 400, error: "올바른 이메일을 입력해 주세요." };
  }
  if (name.length < 2 || name.length > 40) {
    return { ok: false as const, status: 400, error: "이름은 2~40자로 입력해 주세요." };
  }
  if (!validateMemberPassword(input.password)) {
    return {
      ok: false as const,
      status: 400,
      error: "비밀번호는 영문과 숫자를 포함해 10자 이상 입력해 주세요.",
    };
  }
  if (input.password !== input.passwordConfirmation) {
    return { ok: false as const, status: 400, error: "비밀번호 확인이 일치하지 않습니다." };
  }
  if (!/^01[016789]-?\d{3,4}-?\d{4}$/.test(phone)) {
    return { ok: false as const, status: 400, error: "올바른 휴대전화 번호를 입력해 주세요." };
  }
  if (!input.termsAccepted || !input.privacyAccepted) {
    return { ok: false as const, status: 400, error: "이용약관과 개인정보 수집·이용에 모두 동의해 주세요." };
  }

  const db = getD1();
  const signupSetting = await db
    .prepare("SELECT value FROM settings WHERE key = 'signup_code'")
    .first<{ value: string }>();
  const requiredCode = signupSetting?.value?.trim() ?? "";
  if (requiredCode && input.signupCode.trim() !== requiredCode) {
    return { ok: false as const, status: 400, error: "가입코드를 확인해 주세요." };
  }
  const existing = await db
    .prepare("SELECT id FROM members WHERE lower(email) = ?")
    .bind(email)
    .first<{ id: number }>();
  if (existing) {
    return { ok: false as const, status: 409, error: "이미 가입된 이메일입니다." };
  }

  const now = nowIso();
  const result = await db
    .prepare(
      `INSERT INTO members
        (email, name, role, status, points, charge_points, reward_points, phone, joined_at)
       VALUES (?, ?, 'member', 'active', 0, 0, 0, ?, ?)`,
    )
    .bind(email, name, phone, now)
    .run();
  const memberId = Number(result.meta.last_row_id);
  await db.batch([
    db
      .prepare(
        `INSERT INTO member_credentials
          (member_id, password_hash, failed_attempts, locked_until, updated_at)
         VALUES (?, ?, 0, NULL, ?)`,
      )
      .bind(memberId, await hashAdminPassword(input.password), now),
  ]);
  await ensureReferralCode(memberId);
  await attachReferral(memberId, String(input.referralCode ?? ""));
  return {
    ok: true as const,
    status: 201,
    cookies: await createMemberSession(memberId, request),
  };
}

export async function authenticateGoogleMember(
  credential: string,
  mode: "login" | "register",
  signupCode: string,
  request: Request,
  referralCode = "",
  agreements: { termsAccepted?: boolean; privacyAccepted?: boolean } = {},
) {
  const db = getD1();
  const settings = await db
    .prepare(
      `SELECT key, value
       FROM settings
       WHERE key IN ('google_client_id', 'signup_code')`,
    )
    .all();
  const values = Object.fromEntries(
    settings.results.map((row) => [String(row.key), String(row.value)]),
  );
  const clientId = String(values.google_client_id ?? "").trim();
  if (!clientId) {
    return {
      ok: false as const,
      status: 503,
      error: "Google 로그인이 아직 설정되지 않았습니다.",
    };
  }
  if (!credential || credential.length > 10_000) {
    return {
      ok: false as const,
      status: 400,
      error: "Google 로그인 정보를 다시 확인해 주세요.",
    };
  }

  let claims: {
    sub?: string;
    email?: string;
    email_verified?: boolean;
    name?: string;
  };
  try {
    const verified = await jwtVerify(credential, GOOGLE_JWKS, {
      audience: clientId,
      issuer: ["https://accounts.google.com", "accounts.google.com"],
    });
    claims = verified.payload;
  } catch {
    return {
      ok: false as const,
      status: 401,
      error: "유효하지 않은 Google 로그인입니다. 다시 시도해 주세요.",
    };
  }

  const subject = String(claims.sub ?? "").trim();
  const email = String(claims.email ?? "").trim().toLowerCase();
  const googleName = String(claims.name ?? "").trim();
  if (
    !subject ||
    !validateMemberEmail(email) ||
    claims.email_verified !== true
  ) {
    return {
      ok: false as const,
      status: 401,
      error: "확인된 Google 이메일 계정이 필요합니다.",
    };
  }

  const linked = await db
    .prepare(
      `SELECT m.*
       FROM member_identities i
       JOIN members m ON m.id = i.member_id
       WHERE i.provider = 'google' AND i.provider_subject = ?`,
    )
    .bind(subject)
    .first<MemberRow>();
  if (linked) {
    if (linked.status !== "active") {
      return {
        ok: false as const,
        status: 403,
        error: "이용이 중지된 회원 계정입니다.",
      };
    }
    return {
      ok: true as const,
      status: 200,
      cookies: await createMemberSession(linked.id, request),
    };
  }

  let member = await db
    .prepare("SELECT * FROM members WHERE lower(email) = ?")
    .bind(email)
    .first<MemberRow>();
  if (!member && mode !== "register") {
    return {
      ok: false as const,
      status: 404,
      error: "가입되지 않은 Google 계정입니다. 회원가입에서 계속해 주세요.",
    };
  }

  const now = nowIso();
  if (!member) {
    if (!agreements.termsAccepted || !agreements.privacyAccepted) {
      return { ok: false as const, status: 400, error: "이용약관과 개인정보 수집·이용에 모두 동의해 주세요." };
    }
    const requiredCode = String(values.signup_code ?? "").trim();
    if (requiredCode && signupCode.trim() !== requiredCode) {
      return {
        ok: false as const,
        status: 400,
        error: "가입코드를 확인해 주세요.",
      };
    }
    const result = await db
      .prepare(
        `INSERT INTO members
          (email, name, role, status, points, charge_points, reward_points, phone, joined_at)
         VALUES (?, ?, 'member', 'active', 0, 0, 0, '', ?)`,
      )
      .bind(
        email,
        googleName.length >= 2 ? googleName.slice(0, 40) : email.split("@")[0],
        now,
      )
      .run();
    const memberId = Number(result.meta.last_row_id);
    member = await db
      .prepare("SELECT * FROM members WHERE id = ?")
      .bind(memberId)
      .first<MemberRow>();
    await ensureReferralCode(memberId);
    await attachReferral(memberId, referralCode);
  }

  if (!member || member.status !== "active") {
    return {
      ok: false as const,
      status: 403,
      error: "이용 가능한 회원 계정을 확인하지 못했습니다.",
    };
  }
  await db
    .prepare(
      `INSERT OR IGNORE INTO member_identities
        (member_id, provider, provider_subject, provider_email, created_at)
       VALUES (?, 'google', ?, ?, ?)`,
    )
    .bind(member.id, subject, email, now)
    .run();
  await db
    .prepare("UPDATE members SET email_verified = 1 WHERE id = ?")
    .bind(member.id)
    .run();
  await completeReferralVerification(member.id);
  return {
    ok: true as const,
    status: mode === "register" ? 201 : 200,
    cookies: await createMemberSession(member.id, request),
  };
}

export async function authenticateMember(
  emailValue: string,
  password: string,
  request: Request,
) {
  const email = emailValue.trim().toLowerCase();
  const db = getD1();
  const row = await db
    .prepare(
      `SELECT m.*, c.password_hash, c.failed_attempts, c.locked_until
       FROM members m
       JOIN member_credentials c ON c.member_id = m.id
       WHERE lower(m.email) = ?`,
    )
    .bind(email)
    .first<MemberRow & {
      password_hash: string;
      failed_attempts: number;
      locked_until: string | null;
    }>();
  const genericError = "이메일 또는 비밀번호를 확인해 주세요.";
  if (!row || row.status !== "active") {
    return { ok: false as const, status: 401, error: genericError };
  }
  if (row.locked_until && new Date(row.locked_until).getTime() > Date.now()) {
    return {
      ok: false as const,
      status: 429,
      error: "로그인 시도가 많아 잠시 잠겼습니다. 15분 후 다시 시도해 주세요.",
    };
  }
  if (!(await verifyAdminPassword(password, row.password_hash))) {
    const attempts = Number(row.failed_attempts ?? 0) + 1;
    const lockedUntil =
      attempts >= 5
        ? new Date(Date.now() + 15 * 60 * 1000).toISOString()
        : null;
    await db
      .prepare(
        `UPDATE member_credentials
         SET failed_attempts = ?, locked_until = ?, updated_at = ?
         WHERE member_id = ?`,
      )
      .bind(attempts >= 5 ? 0 : attempts, lockedUntil, nowIso(), row.id)
      .run();
    return { ok: false as const, status: 401, error: genericError };
  }
  await db
    .prepare(
      `UPDATE member_credentials
       SET failed_attempts = 0, locked_until = NULL, updated_at = ?
       WHERE member_id = ?`,
    )
    .bind(nowIso(), row.id)
    .run();
  return {
    ok: true as const,
    status: 200,
    cookies: await createMemberSession(row.id, request),
  };
}

export async function requestMemberPasswordReset(emailValue: string, phoneValue: string) {
  const email = emailValue.trim().toLowerCase();
  const phone = phoneValue.replace(/\D/g, "");
  if (!validateMemberEmail(email) || phone.length < 8) return;
  const db = getD1();
  const member = await db
    .prepare("SELECT id FROM members WHERE lower(email) = ? AND replace(replace(replace(phone, '-', ''), ' ', ''), '.', '') = ? AND status = 'active'")
    .bind(email, phone)
    .first<{ id: number }>();
  if (!member) return;
  const recent = await db.prepare("SELECT id FROM password_reset_requests WHERE member_id = ? AND status = 'pending' AND requested_at > ? LIMIT 1").bind(member.id, new Date(Date.now() - 60 * 60 * 1000).toISOString()).first();
  if (recent) return;
  await db.prepare("INSERT INTO password_reset_requests (member_id, status, requested_at) VALUES (?, 'pending', ?)").bind(member.id, nowIso()).run();
}

export async function logoutMember(request: Request) {
  const tokens = Array.from(
    new Set(
      [
        readCookie(request.headers, MEMBER_SESSION_COOKIE),
        readCookie(request.headers, MEMBER_EMBEDDED_SESSION_COOKIE),
      ].filter(Boolean),
    ),
  );
  if (tokens.length) {
    await getD1().batch(
      await Promise.all(
        tokens.map(async (token) =>
          getD1()
            .prepare("DELETE FROM member_sessions WHERE session_hash = ?")
            .bind(await sha256(token)),
        ),
      ),
    );
  }
  return sessionCookies("", request, 0);
}
