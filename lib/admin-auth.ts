import { getD1, nowIso } from "./server";
import {
  hashAdminPassword,
  validateAdminPassword,
  verifyAdminPassword,
} from "./password-hash";
import {
  parseManagerPermissions,
  SUPERVISOR_PERMISSIONS,
} from "./admin-permissions";

export {
  hashAdminPassword,
  validateAdminPassword,
  verifyAdminPassword,
} from "./password-hash";
export {
  canAdmin,
  DEFAULT_MANAGER_PERMISSIONS,
  MANAGER_PERMISSION_KEYS,
  parseManagerPermissions,
  SUPERVISOR_PERMISSIONS,
  type ManagerPermission,
} from "./admin-permissions";

export const ADMIN_SESSION_COOKIE = "point_mall_admin_session";
const SESSION_SECONDS = 60 * 60 * 12;

export type AdminIdentity = {
  id: number | string;
  name: string;
  username: string;
  role: "supervisor" | "manager";
  authType: "owner" | "staff";
  isSupervisor: boolean;
  permissions: string[];
  forcePasswordChange: boolean;
};

type AdminAccountRow = {
  id: number;
  username: string;
  name: string;
  password_hash: string;
  role: string;
  status: string;
  force_password_change: number;
  failed_attempts: number;
  locked_until: string | null;
  permissions: string | null;
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

export function isSameOriginMutation(request: Request) {
  const origin = request.headers.get("origin");
  return Boolean(origin && origin === new URL(request.url).origin);
}

export function validateAdminUsername(username: string) {
  return /^[a-z0-9._-]{4,40}$/.test(username);
}

function identityFromRow(row: AdminAccountRow): AdminIdentity {
  const isSupervisor = row.role === "supervisor";
  return {
    id: row.id,
    name: row.name,
    username: row.username,
    role: isSupervisor ? "supervisor" : "manager",
    authType: "staff",
    isSupervisor,
    permissions: isSupervisor
      ? [...SUPERVISOR_PERMISSIONS]
      : parseManagerPermissions(row.permissions),
    forcePasswordChange: Boolean(row.force_password_change),
  };
}

export async function getStaffAdminFromHeaders(
  headers: Headers,
): Promise<AdminIdentity | null> {
  const token = readCookie(headers, ADMIN_SESSION_COOKIE);
  if (!token) return null;
  const sessionHash = await sha256(token);
  const row = await getD1()
    .prepare(
      `SELECT a.*
       FROM admin_sessions s
       JOIN admin_accounts a ON a.id = s.admin_account_id
       WHERE s.session_hash = ?
         AND s.expires_at > ?
         AND a.status = 'active'`,
    )
    .bind(sessionHash, nowIso())
    .first<AdminAccountRow>();
  return row ? identityFromRow(row) : null;
}

export async function authenticateStaffAdmin(
  username: string,
  password: string,
  request: Request,
) {
  const db = getD1();
  const normalized = username.trim().toLowerCase();
  const account = await db
    .prepare("SELECT * FROM admin_accounts WHERE username = ?")
    .bind(normalized)
    .first<AdminAccountRow>();
  const genericError = "아이디 또는 비밀번호를 확인해 주세요.";

  if (!account || account.status !== "active") {
    return { ok: false as const, status: 401, error: genericError };
  }

  if (account.locked_until && new Date(account.locked_until).getTime() > Date.now()) {
    return {
      ok: false as const,
      status: 429,
      error: "로그인 시도가 많아 잠시 잠겼습니다. 15분 후 다시 시도해 주세요.",
    };
  }

  const valid = await verifyAdminPassword(password, account.password_hash);
  if (!valid) {
    const failedAttempts = Number(account.failed_attempts ?? 0) + 1;
    const lockedUntil =
      failedAttempts >= 5
        ? new Date(Date.now() + 15 * 60 * 1000).toISOString()
        : null;
    await db
      .prepare(
        "UPDATE admin_accounts SET failed_attempts = ?, locked_until = ?, updated_at = ? WHERE id = ?",
      )
      .bind(failedAttempts >= 5 ? 0 : failedAttempts, lockedUntil, nowIso(), account.id)
      .run();
    return { ok: false as const, status: 401, error: genericError };
  }

  await db
    .prepare(
      `UPDATE admin_accounts
       SET failed_attempts = 0, locked_until = NULL, last_login_at = ?, updated_at = ?
       WHERE id = ?`,
    )
    .bind(nowIso(), nowIso(), account.id)
    .run();
  const cookie = await createStaffSession(account.id, request);
  return {
    ok: true as const,
    status: 200,
    cookie,
    admin: identityFromRow(account),
  };
}

export async function createStaffSession(accountId: number, request: Request) {
  const token = randomToken();
  const sessionHash = await sha256(token);
  const now = nowIso();
  const expiresAt = new Date(Date.now() + SESSION_SECONDS * 1000).toISOString();
  const db = getD1();
  await db.batch([
    db
      .prepare("DELETE FROM admin_sessions WHERE expires_at <= ?")
      .bind(now),
    db
      .prepare(
        `INSERT INTO admin_sessions
          (session_hash, admin_account_id, expires_at, created_at)
         VALUES (?, ?, ?, ?)`,
      )
      .bind(sessionHash, accountId, expiresAt, now),
  ]);
  const secure = isLocalRequest(request) ? "" : "; Secure";
  return `${ADMIN_SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_SECONDS}${secure}`;
}

export async function deleteCurrentStaffSession(request: Request) {
  const token = readCookie(request.headers, ADMIN_SESSION_COOKIE);
  if (token) {
    await getD1()
      .prepare("DELETE FROM admin_sessions WHERE session_hash = ?")
      .bind(await sha256(token))
      .run();
  }
  const secure = isLocalRequest(request) ? "" : "; Secure";
  return `${ADMIN_SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`;
}

export async function replaceStaffPassword(
  admin: AdminIdentity,
  currentPassword: string,
  newPassword: string,
  request: Request,
) {
  if (admin.authType !== "staff") {
    return { ok: false as const, status: 403, error: "직원 관리자 계정이 아닙니다." };
  }
  const db = getD1();
  const account = await db
    .prepare("SELECT * FROM admin_accounts WHERE id = ? AND status = 'active'")
    .bind(Number(admin.id))
    .first<AdminAccountRow>();
  if (!account || !(await verifyAdminPassword(currentPassword, account.password_hash))) {
    return { ok: false as const, status: 401, error: "현재 비밀번호가 올바르지 않습니다." };
  }
  if (!validateAdminPassword(newPassword)) {
    return {
      ok: false as const,
      status: 400,
      error: "새 비밀번호는 영문과 숫자를 포함해 10자 이상 입력해 주세요.",
    };
  }
  const passwordHash = await hashAdminPassword(newPassword);
  await db.batch([
    db
      .prepare(
        `UPDATE admin_accounts
         SET password_hash = ?, force_password_change = 0,
           failed_attempts = 0, locked_until = NULL, updated_at = ?
         WHERE id = ?`,
      )
      .bind(passwordHash, nowIso(), account.id),
    db
      .prepare("DELETE FROM admin_sessions WHERE admin_account_id = ?")
      .bind(account.id),
  ]);
  const persisted = await db
    .prepare("SELECT username, password_hash FROM admin_accounts WHERE id = ?")
    .bind(account.id)
    .first<{ username: string; password_hash: string }>();
  if (
    !persisted ||
    !(await verifyAdminPassword(newPassword, persisted.password_hash))
  ) {
    return {
      ok: false as const,
      status: 500,
      error: "새 비밀번호 저장을 확인하지 못했습니다. 다시 시도해 주세요.",
    };
  }
  return {
    ok: true as const,
    status: 200,
    username: persisted.username,
    cookie: await deleteCurrentStaffSession(request),
  };
}
