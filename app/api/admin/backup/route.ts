import { requireAdmin } from "../../../../lib/data";
import { canAdmin } from "../../../../lib/admin-auth";
import { getD1, jsonError, nowIso } from "../../../../lib/server";

const exportTables = [
  "settings",
  "members",
  "member_identities",
  "products",
  "product_catalog_details",
  "carts",
  "wishlists",
  "shipping_addresses",
  "orders",
  "order_items",
  "point_logs",
  "referral_codes",
  "referral_visits",
  "referrals",
  "reward_events",
  "referral_flags",
  "attendance_records",
  "finance_requests",
  "reviews",
  "popups",
  "notices",
  "coupons",
  "inquiries",
  "audit_logs",
] as const;

export async function GET(request: Request) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) return jsonError("관리자 권한이 필요합니다.", 403);
    if (!canAdmin(admin, "backup")) {
      return jsonError("슈퍼바이저만 운영 데이터를 백업할 수 있습니다.", 403);
    }
    const db = getD1();
    const entries = await Promise.all(
      exportTables.map(async (table) => {
        const rows = await db.prepare(`SELECT * FROM ${table}`).all();
        return [table, rows.results] as const;
      }),
    );
    const adminAccounts = admin.isSupervisor
      ? (
          await db
            .prepare(
              `SELECT id, username, name, role, permissions, status, force_password_change,
                failed_attempts, locked_until, last_login_at, created_at, updated_at
               FROM admin_accounts ORDER BY id`,
            )
            .all()
        ).results
      : [];
    const payload = {
      format: "point-mall-backup",
      version: 1,
      exportedAt: nowIso(),
      exportedBy: String(admin.name ?? admin.username ?? "관리자"),
      data: { ...Object.fromEntries(entries), admin_accounts: adminAccounts },
      security: {
        excluded: [
          "member_credentials.password_hash",
          "member_sessions",
          "admin_accounts.password_hash",
          "admin_sessions",
        ],
      },
    };
    const date = new Date().toISOString().slice(0, 10);
    return new Response(JSON.stringify(payload, null, 2), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="point-mall-backup-${date}.json"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "백업 파일을 만들지 못했습니다.",
      500,
    );
  }
}
