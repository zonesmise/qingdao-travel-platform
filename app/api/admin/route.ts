import { requireAdmin } from "../../../lib/data";
import { getD1, jsonError, nowIso } from "../../../lib/server";
import {
  canAdmin,
  DEFAULT_MANAGER_PERMISSIONS,
  hashAdminPassword,
  isSameOriginMutation,
  parseManagerPermissions,
  validateAdminPassword,
  validateAdminUsername,
  verifyAdminPassword,
  type AdminIdentity,
} from "../../../lib/admin-auth";
import {
  completeReferralVerification,
  processMatureRewardEvents,
  revokeReferralOrderRewards,
  scheduleFirstPurchaseRewards,
} from "../../../lib/rewards";
import { processExpiredPaymentReservations } from "../../../lib/payments";
import { categoryEntryFor, parseCategoryConfig, selectableCategoryNames } from "../../../lib/category-config";
import {
  cleanProductTypeFields,
  guessProductType,
  normalizeProductType,
} from "../../../lib/product-specs";
import {
  getTestDataSummary,
  resetTestData,
  seedTestData,
  TEST_MEMBER_PASSWORD,
} from "../../../lib/test-data";

const editableSettings = new Set([
  "brand_name",
  "brand_english_name",
  "brand_tagline",
  "point_name",
  "point_unit",
  "logo_text",
  "logo_url",
  "primary_color",
  "secondary_color",
  "accent_color",
  "hero_title",
  "hero_subtitle",
  "support_phone",
  "support_hours",
  "support_email",
  "contact_floating_enabled",
  "contact_default_open",
  "contact_always_available",
  "contact_start_time",
  "contact_end_time",
  "contact_weekdays",
  "contact_counselor_image_url",
  "contact_kakao_enabled",
  "contact_kakao_url",
  "contact_telegram_enabled",
  "contact_telegram_url",
  "contact_line_enabled",
  "contact_line_url",
  "contact_live_enabled",
  "contact_live_url",
  "company_name",
  "business_number",
  "representative_name",
  "company_address",
  "bank_name",
  "bank_account",
  "bank_holder",
  "signup_code",
  "seo_title",
  "seo_description",
  "site_url",
  "terms_text",
  "privacy_text",
  "footer_notice",
  "google_client_id",
  "review_text_points",
  "review_photo_points",
  "review_write_days",
  "review_min_length",
  "review_max_images",
  "review_auto_publish",
  "attendance_enabled",
  "attendance_daily_points",
  "attendance_streak_days",
  "attendance_streak_bonus",
  "referral_enabled",
  "referral_join_reward",
  "referral_first_order_inviter_reward",
  "referral_first_order_friend_reward",
  "referral_min_order_points",
  "referral_hold_days",
  "referral_cookie_days",
  "referral_monthly_cap",
  "referral_reward_expiry_days",
  "kakao_payment_url",
  "kakao_payment_hold_hours",
  "cash_reward_rate",
  "product_categories",
  "product_category_config",
  "product_brands",
  "product_brand_groups",
  "feature_shipping_enabled",
  "shipping_base_fee",
  "shipping_free_threshold",
  "shipping_remote_fee",
  "shipping_remote_prefixes",
  "shipping_return_fee",
  "shipping_exchange_fee",
  "shipping_return_address",
  "feature_home_display_enabled",
  "home_display_sections",
  "feature_variant_stock_enabled",
  "feature_member_tiers_enabled",
  "member_tiers",
  "feature_discount_enabled",
  "period_discount_name",
  "period_discount_rate",
  "period_discount_category",
  "period_discount_starts_at",
  "period_discount_ends_at",
  "feature_templates_enabled",
  "template_order_received",
  "template_payment_confirmed",
  "template_shipping",
  "template_cancelled",
  "template_returned",
  "feature_statistics_enabled",
  "storefront_skin",
  "youtube_live_enabled",
  "youtube_live_orientation",
  "youtube_live_title",
  "youtube_live_url",
  "youtube_live_notice",
  "youtube_live_slot_count",
  "youtube_live_slot_numbers",
  "youtube_live_product_ids",
  "youtube_live_slots",
  "youtube_live_current_number",
  "youtube_live_history",
  "youtube_replays",
  "youtube_shorts",
]);

const channelBroadcastKeys = [
  "storefront_skin",
  "youtube_live_enabled",
  "youtube_live_orientation",
  "youtube_live_title",
  "youtube_live_url",
  "youtube_live_notice",
  "youtube_live_slot_count",
  "youtube_live_slot_numbers",
  "youtube_live_product_ids",
  "youtube_live_slots",
  "youtube_live_current_number",
  "youtube_live_history",
  "youtube_replays",
  "youtube_shorts",
] as const;

function validProductImageUrl(value: string) {
  if (/^https?:\/\//i.test(value)) return true;
  // Verified catalog photos are deployed with the Site rather than uploaded to R2.
  // The editor can display these paths, so the save validator must accept the same
  // safe, image-only path set instead of silently discarding them.
  if (/^\/catalog\/[a-z0-9][a-z0-9/_-]*\.(?:jpe?g|png|webp)$/i.test(value)) return true;
  if (!value.startsWith("/api/product-image?")) return false;
  try {
    const key = new URL(value, "https://point-mall.local").searchParams.get("key") ?? "";
    return /^products\/(?:\d+|drafts\/[a-z0-9_-]+)\/[a-f0-9-]+\.(jpg|png|webp)$/i.test(key);
  } catch {
    return false;
  }
}

function cleanImageUrls(value: unknown) {
  const values = Array.isArray(value) ? value : String(value ?? "").split(/\n|,/);
  return Array.from(
    new Set(values.map((item) => String(item).trim()).filter(validProductImageUrl)),
  ).slice(0, 11);
}

function cleanContactUrl(value: unknown) {
  const url = String(value ?? "").trim().slice(0, 500);
  if (!url) return "";
  if (url.startsWith("/") && !url.startsWith("//")) return url;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : "";
  } catch {
    return "";
  }
}

function cleanProductMedia(
  value: unknown,
  fallbackImage: string,
  fallbackImages: string[],
  productName: string,
) {
  const source = Array.isArray(value) && value.length
    ? value
    : [fallbackImage, ...fallbackImages];
  const seen = new Set<string>();
  return source
    .map((entry, index) => {
      const url = String(
        typeof entry === "string" ? entry : (entry as Record<string, unknown>)?.url ?? "",
      ).trim();
      if (!validProductImageUrl(url) || seen.has(url)) return null;
      seen.add(url);
      const record = typeof entry === "object" && entry
        ? entry as Record<string, unknown>
        : {};
      const alt = String(record.alt ?? `${productName || "상품"} ${index === 0 ? "대표사진" : index + 1}`)
        .trim()
        .slice(0, 125);
      const width = Math.max(0, Math.min(10000, Number(record.width ?? 0))) || undefined;
      const height = Math.max(0, Math.min(10000, Number(record.height ?? 0))) || undefined;
      return { url, alt, ...(width && height ? { width, height } : {}) };
    })
    .filter(Boolean)
    .slice(0, 12);
}

async function creditPurchaseReward(db: ReturnType<typeof getD1>, orderId: number) {
  const order = await db
    .prepare(
      `SELECT o.order_no, o.member_id, o.purchase_reward_points, o.purchase_reward_status,
              m.points, m.reward_points
       FROM orders o JOIN members m ON m.id = o.member_id WHERE o.id = ?`,
    )
    .bind(orderId)
    .first<Record<string, unknown>>();
  const amount = Number(order?.purchase_reward_points || 0);
  if (!order || amount < 1 || order.purchase_reward_status !== "pending") return;
  const claimed = await db.prepare("UPDATE orders SET purchase_reward_status = 'credited' WHERE id = ? AND purchase_reward_status = 'pending'").bind(orderId).run();
  if (!Number(claimed.meta.changes ?? 0)) return;
  await db.batch([
    db.prepare("UPDATE members SET points = points + ?, reward_points = reward_points + ? WHERE id = ?").bind(amount, amount, Number(order.member_id)),
    db.prepare(
      `INSERT INTO point_logs
        (member_id, amount, type, memo, balance_after, created_at, point_bucket)
       SELECT ?, ?, '구매적립', ?, points, ?, 'reward' FROM members WHERE id = ?`,
    ).bind(Number(order.member_id), amount, `${order.order_no} 구매 확정 적립`, nowIso(), Number(order.member_id)),
  ]);
}

function parseOptionLines(value: unknown) {
  const lines = String(value ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  return lines
    .map((line) => {
      const [name, ...rest] = line.split(":");
      const values = rest
        .join(":")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
      return { name: name.trim(), values: Array.from(new Set(values)) };
    })
    .filter((option) => option.name && option.values.length)
    .slice(0, 5);
}
function parseVariants(value: unknown): Array<{ key: string; options: Record<string, string>; stock: number; [key: string]: unknown }> {
  try { const parsed = JSON.parse(String(value ?? "[]")); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
}

function requiredPermission(action: string) {
  if (action === "admin_account.self_update") return "self";
  if (action.startsWith("admin_account.")) return "administrators";
  if (action.startsWith("settings.")) return "settings";
  if (action.startsWith("live.")) return "live";
  if (action.startsWith("channel.")) return "live";
  if (action.startsWith("test_data.")) return "settings";
  if (action.startsWith("product.")) return "products";
  if (action === "member.point") return "points";
  if (action.startsWith("member.")) return "members";
  if (action.startsWith("reward.")) return "rewards";
  if (action.startsWith("order.")) return "orders";
  if (action.startsWith("finance.")) return "";
  if (action.startsWith("review.")) return "reviews";
  if (action.startsWith("notice.")) return "notices";
  if (action.startsWith("coupon.")) return "coupons";
  if (action.startsWith("inquiry.")) return "inquiries";
  if (action.startsWith("popup.")) return "popups";
  return "";
}

async function getAdminPayload(admin: AdminIdentity, scope = "") {
  if (!scope || scope === "dashboard") {
    await processExpiredPaymentReservations();
    await processMatureRewardEvents();
  }
  const db = getD1();
  const need = (...values: string[]) => !scope || values.includes(scope);
  const [
    settingsRows,
    members,
    products,
    salesChannels,
    channelOwnerCandidates,
    orders,
    finance,
    reviews,
    popups,
    pointLogs,
    adminAccounts,
    notices,
    coupons,
    inquiries,
    auditLogs,
    referrals,
    rewardEvents,
    referralFlags,
    testData,
  ] =
    await Promise.all([
      db.prepare("SELECT key, value FROM settings ORDER BY key").all(),
      need("members", "points", "rewards") ? db
        .prepare(
          `SELECT m.*,
            (SELECT COUNT(*) FROM orders o WHERE o.member_id = m.id) AS order_count,
            (SELECT COALESCE(SUM(o.total_points), 0) FROM orders o WHERE o.member_id = m.id) AS used_points,
            (SELECT scenario FROM test_data_members t WHERE t.member_id = m.id) AS test_scenario
            ,(SELECT MAX(requested_at) FROM password_reset_requests pr WHERE pr.member_id = m.id AND pr.status = 'pending') AS reset_requested_at
           FROM members m ORDER BY m.id DESC`,
        )
        .all() : Promise.resolve({ results: [] }),
      need("products", "live", "operations") ? db
        .prepare(scope !== "products"
          ? `SELECT p.id, p.name, p.category, p.brand, p.product_code, p.style_number,
                    p.image_url, p.point_price, p.stock, p.status, p.badge, p.sales_count,
                    d.subcategory, d.product_type
             FROM products p
             LEFT JOIN product_catalog_details d ON d.product_id = p.id
             WHERE p.status != 'deleted' ORDER BY p.id DESC`
          : `SELECT p.*, d.name_en, d.subcategory, d.product_type, d.type_fields_json,
                    (SELECT COUNT(*) FROM reviews r WHERE r.product_id = p.id AND r.deleted_at IS NULL) AS review_count
             FROM products p
             LEFT JOIN product_catalog_details d ON d.product_id = p.id
             WHERE p.status != 'deleted' ORDER BY p.id DESC`)
        .all() : Promise.resolve({ results: [] }),
      need("live") ? db
        .prepare(
          `SELECT c.*,
            (SELECT m.name FROM members m WHERE m.id = c.owner_member_id) AS owner_member_name,
            (SELECT m.email FROM members m WHERE m.id = c.owner_member_id) AS owner_member_email,
            (SELECT COUNT(*) FROM sales_channel_products cp WHERE cp.channel_id = c.id) AS product_count,
            (SELECT GROUP_CONCAT(cp.product_id) FROM sales_channel_products cp WHERE cp.channel_id = c.id) AS product_ids,
            (SELECT COUNT(DISTINCT oi.order_id) FROM order_items oi WHERE oi.channel_id = c.id) AS order_count,
            (SELECT COALESCE(SUM(oi.point_price * oi.quantity), 0) FROM order_items oi WHERE oi.channel_id = c.id) AS sales_amount
           FROM sales_channels c
           ORDER BY c.sort_order, c.id`,
        )
        .all() : Promise.resolve({ results: [] }),
      need("live") ? db
        .prepare(
          `SELECT m.id, m.email, m.name, m.status,
            c.id AS channel_id, c.name AS channel_name
           FROM members m
           LEFT JOIN sales_channels c ON c.owner_member_id = m.id
           WHERE m.status = 'active' OR c.id IS NOT NULL
           ORDER BY CASE WHEN c.id IS NULL THEN 1 ELSE 0 END, m.email COLLATE NOCASE`,
        )
        .all() : Promise.resolve({ results: [] }),
      need("orders") ? db
        .prepare(
          `SELECT o.*, m.name AS member_name, m.email AS member_email,
            (SELECT scenario FROM test_data_members t WHERE t.member_id = m.id) AS test_scenario,
            (SELECT GROUP_CONCAT(
              oi.product_name ||
              CASE
                WHEN oi.selected_options IS NULL OR oi.selected_options = '{}' THEN ''
                ELSE ' (' ||
                  replace(replace(replace(replace(oi.selected_options, '{"', ''), '"}', ''), '":"', ': '), '","', ', ')
                  || ')'
              END ||
              ' × ' || oi.quantity,
              ', '
            )
             FROM order_items oi WHERE oi.order_id = o.id) AS items
           FROM orders o JOIN members m ON m.id = o.member_id
           ORDER BY o.id DESC LIMIT 100`,
        )
        .all() : Promise.resolve({ results: [] }),
      need("finance") ? db
        .prepare(
          `SELECT f.*, m.name AS member_name, m.email AS member_email
           FROM finance_requests f JOIN members m ON m.id = f.member_id
           ORDER BY f.id DESC LIMIT 100`,
        )
        .all() : Promise.resolve({ results: [] }),
      need("reviews") ? db
        .prepare(
          `SELECT r.*, p.name AS product_name, m.name AS member_name, m.email AS member_email,
                  (SELECT scenario FROM test_data_members t WHERE t.member_id = m.id) AS test_scenario,
                  o.order_no, oi.selected_options, oi.quantity
           FROM reviews r
           JOIN products p ON p.id = r.product_id
           JOIN members m ON m.id = r.member_id
           LEFT JOIN orders o ON o.id = r.order_id
           LEFT JOIN order_items oi ON oi.id = r.order_item_id
           ORDER BY r.id DESC LIMIT 100`,
        )
        .all() : Promise.resolve({ results: [] }),
      need("popups") ? db.prepare("SELECT * FROM popups ORDER BY id DESC").all() : Promise.resolve({ results: [] }),
      need("points", "rewards") ? db
        .prepare(
          `SELECT l.*, m.name AS member_name, m.email AS member_email
           FROM point_logs l JOIN members m ON m.id = l.member_id
           ORDER BY l.id DESC LIMIT 100`,
        )
        .all() : Promise.resolve({ results: [] }),
      need("administrators", "self")
        ? admin.isSupervisor
          ? db
            .prepare(
              `SELECT id, username, name, role, permissions, status, force_password_change,
                failed_attempts, locked_until, last_login_at, created_at, updated_at
               FROM admin_accounts ORDER BY id DESC`,
            )
            .all()
          : typeof admin.id === "number"
            ? db
              .prepare(
                `SELECT id, username, name, role, permissions, status, force_password_change,
                  failed_attempts, locked_until, last_login_at, created_at, updated_at
                 FROM admin_accounts
                 WHERE id = ?`,
              )
              .bind(admin.id)
              .all()
            : Promise.resolve({ results: [] })
        : Promise.resolve({ results: [] }),
      need("notices") ? db.prepare("SELECT * FROM notices ORDER BY id DESC").all() : Promise.resolve({ results: [] }),
      need("coupons") ? db
        .prepare(
          `SELECT c.*, m.name AS used_member_name, m.email AS used_member_email
           FROM coupons c LEFT JOIN members m ON m.id = c.used_by
           ORDER BY c.id DESC LIMIT 500`,
        )
        .all() : Promise.resolve({ results: [] }),
      need("inquiries") ? db
        .prepare(
          `SELECT i.*, m.name AS member_name, m.email AS member_email
           FROM inquiries i JOIN members m ON m.id = i.member_id
           ORDER BY i.id DESC LIMIT 200`,
        )
        .all() : Promise.resolve({ results: [] }),
      need("audit") ? db.prepare("SELECT * FROM audit_logs ORDER BY id DESC LIMIT 200").all() : Promise.resolve({ results: [] }),
      need("rewards") ? db.prepare(`SELECT r.*, inviter.name AS inviter_name, inviter.email AS inviter_email, invitee.name AS invitee_name, invitee.email AS invitee_email FROM referrals r JOIN members inviter ON inviter.id = r.inviter_id JOIN members invitee ON invitee.id = r.invitee_id ORDER BY r.id DESC LIMIT 300`).all() : Promise.resolve({ results: [] }),
      need("rewards") ? db.prepare(`SELECT e.*, m.name AS member_name, m.email AS member_email FROM reward_events e JOIN members m ON m.id = e.member_id ORDER BY e.id DESC LIMIT 500`).all() : Promise.resolve({ results: [] }),
      need("rewards") ? db.prepare("SELECT * FROM referral_flags ORDER BY id DESC LIMIT 200").all() : Promise.resolve({ results: [] }),
      need("settings") && admin.isSupervisor ? getTestDataSummary() : Promise.resolve(null),
    ]);

  const allSettings = Object.fromEntries(
    settingsRows.results.map((row) => [String(row.key), String(row.value)]),
  );
  const managerDisplaySettings = new Set([
    "brand_name",
    "brand_english_name",
    "brand_tagline",
    "point_name",
    "point_unit",
    "logo_text",
    "logo_url",
    "primary_color",
    "secondary_color",
    "accent_color",
  ]);
  if (canAdmin(admin, "products")) {
    managerDisplaySettings.add("product_categories");
    managerDisplaySettings.add("product_category_config");
    managerDisplaySettings.add("product_brands");
    managerDisplaySettings.add("product_brand_groups");
  }
  if (canAdmin(admin, "live")) {
    for (const key of [
      "storefront_skin",
      "youtube_live_enabled",
      "youtube_live_orientation",
      "youtube_live_title",
      "youtube_live_url",
      "youtube_live_notice",
      "youtube_live_slot_count",
      "youtube_live_slot_numbers",
      "youtube_live_product_ids",
      "youtube_live_slots",
      "youtube_live_current_number",
      "youtube_live_history",
      "youtube_replays",
      "youtube_shorts",
    ]) managerDisplaySettings.add(key);
  }
  const settings = admin.isSupervisor
    ? allSettings
    : Object.fromEntries(
        Object.entries(allSettings).filter(([key]) =>
          managerDisplaySettings.has(key),
        ),
      );
  const visibleMembers = canAdmin(admin, "members") ? members.results : [];
  const visibleProducts = canAdmin(admin, "products") ? products.results : [];
  const visibleSalesChannels = canAdmin(admin, "live") ? salesChannels.results : [];
  const visibleOrders = canAdmin(admin, "orders")
    ? orders.results.map((order) => {
        const { customs_code_encrypted: _encrypted, ...safeOrder } = order as Record<string, unknown>;
        return safeOrder;
      })
    : [];
  const visibleFinance = canAdmin(admin, "finance") ? finance.results : [];
  const visibleReviews = canAdmin(admin, "reviews") ? reviews.results : [];
  const visiblePopups = canAdmin(admin, "popups") ? popups.results : [];
  const visiblePointLogs = canAdmin(admin, "points") ? pointLogs.results : [];
  const visibleNotices = canAdmin(admin, "notices") ? notices.results : [];
  const visibleCoupons = canAdmin(admin, "coupons") ? coupons.results : [];
  const visibleInquiries = canAdmin(admin, "inquiries") ? inquiries.results : [];
  const visibleAuditLogs = canAdmin(admin, "audit") ? auditLogs.results : [];
  const visibleReferrals = canAdmin(admin, "rewards") ? referrals.results : [];
  const visibleRewardEvents = canAdmin(admin, "rewards") ? rewardEvents.results : [];
  const visibleReferralFlags = canAdmin(admin, "rewards") ? referralFlags.results : [];
  const dashboardSummary = scope === "dashboard" ? await db.prepare(
    `SELECT
      (SELECT COUNT(*) FROM members) AS members,
      (SELECT COUNT(*) FROM products WHERE status = 'active') AS active_products,
      (SELECT COUNT(*) FROM orders WHERE status NOT IN ('배송완료', '완료', '취소', '반품완료')) AS pending_orders,
      (SELECT COUNT(*) FROM finance_requests WHERE status IN ('대기', 'pending')) AS pending_finance,
      (SELECT COUNT(*) FROM inquiries WHERE status IN ('접수', 'pending')) AS pending_inquiries,
      (SELECT COALESCE(SUM(total_points), 0) FROM orders) AS total_order_points,
      (SELECT COALESCE(SUM(points), 0) FROM members) AS issued_points,
      (SELECT COUNT(*) FROM orders WHERE created_at >= datetime('now', '-30 days')) AS orders_30,
      (SELECT COALESCE(SUM(cash_amount), 0) FROM orders WHERE created_at >= datetime('now', '-30 days')) AS cash_30,
      (SELECT COALESCE(SUM(used_charge_points + used_reward_points), 0) FROM orders WHERE created_at >= datetime('now', '-30 days')) AS points_30`
  ).first() as Record<string, number> | null : null;
  const dashboardPopularProducts = scope === "dashboard" ? await db.prepare(
    `SELECT id, name, sales_count AS quantity
     FROM products
     WHERE status != 'deleted'
     ORDER BY sales_count DESC, id DESC
     LIMIT 5`
  ).all() : { results: [] };
  const summary = dashboardSummary ? {
    members: Number(dashboardSummary.members || 0),
    activeProducts: Number(dashboardSummary.active_products || 0),
    pendingOrders: Number(dashboardSummary.pending_orders || 0),
    pendingFinance: Number(dashboardSummary.pending_finance || 0),
    pendingInquiries: Number(dashboardSummary.pending_inquiries || 0),
    totalOrderPoints: Number(dashboardSummary.total_order_points || 0),
    issuedPoints: Number(dashboardSummary.issued_points || 0),
  } : {
    members: visibleMembers.length,
    activeProducts: visibleProducts.filter((row) => row.status === "active").length,
    pendingOrders: visibleOrders.filter((row) => ["결제확인대기", "접수", "취소요청"].includes(String(row.status))).length,
    pendingFinance: visibleFinance.filter((row) => row.status === "대기").length,
    pendingInquiries: visibleInquiries.filter((row) => row.status === "접수").length,
    totalOrderPoints: visibleOrders.reduce(
      (sum, row) => sum + Number(row.total_points),
      0,
    ),
    issuedPoints: visibleMembers.reduce((sum, row) => sum + Number(row.points), 0),
  };
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const recentOrders = visibleOrders.filter((row) => new Date(String(row.created_at)).getTime() >= thirtyDaysAgo);
  const completedRecentOrders = recentOrders.filter((row) => !["취소", "반품완료"].includes(String(row.status)));
  const statistics = dashboardSummary ? {
    orders30: Number(dashboardSummary.orders_30 || 0),
    cash30: Number(dashboardSummary.cash_30 || 0),
    points30: Number(dashboardSummary.points_30 || 0),
    returnRate30: 0,
    popularProducts: dashboardPopularProducts.results,
  } : {
    orders30: recentOrders.length,
    cash30: completedRecentOrders.reduce((sum, row) => sum + Number(row.cash_amount || 0), 0),
    points30: completedRecentOrders.reduce((sum, row) => sum + Number(row.used_charge_points || 0) + Number(row.used_reward_points || 0), 0),
    returnRate30: recentOrders.length ? recentOrders.filter((row) => ["취소", "반품완료"].includes(String(row.status))).length / recentOrders.length * 100 : 0,
    popularProducts: [...visibleProducts].sort((a, b) => Number(b.sales_count || 0) - Number(a.sales_count || 0)).slice(0, 5).map((row) => ({ id: row.id, name: row.name, quantity: row.sales_count })),
  };

  return {
    admin,
    settings,
    summary,
    statistics,
    members: visibleMembers,
    products: visibleProducts,
    salesChannels: visibleSalesChannels,
    channelOwnerCandidates: canAdmin(admin, "live") ? channelOwnerCandidates.results : [],
    orders: visibleOrders,
    finance: visibleFinance,
    reviews: visibleReviews,
    popups: visiblePopups,
    pointLogs: visiblePointLogs,
    adminAccounts: adminAccounts.results,
    notices: visibleNotices,
    coupons: visibleCoupons,
    inquiries: visibleInquiries,
    auditLogs: visibleAuditLogs,
    referrals: visibleReferrals,
    rewardEvents: visibleRewardEvents,
    referralFlags: visibleReferralFlags,
    testData: testData ? { ...testData, password: TEST_MEMBER_PASSWORD } : null,
  };
}

export async function GET(request: Request) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) return jsonError("관리자 권한이 필요합니다.", 403);
    const requestedScope = new URL(request.url).searchParams.get("scope") || "dashboard";
    const allowedScopes = new Set([
      "dashboard", "products", "live", "operations", "members", "points", "rewards",
      "orders", "finance", "reviews", "popups", "administrators", "self", "notices",
      "coupons", "inquiries", "audit", "settings",
    ]);
    const scope = allowedScopes.has(requestedScope) ? requestedScope : "dashboard";
    return Response.json(await getAdminPayload(admin, scope));
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "관리 데이터를 불러오지 못했습니다.", 500);
  }
}

export async function POST(request: Request) {
  try {
    if (!isSameOriginMutation(request)) {
      return jsonError("안전하지 않은 요청입니다. 페이지를 새로고침해 주세요.", 403);
    }
    const admin = await requireAdmin(request);
    if (!admin) return jsonError("관리자 권한이 필요합니다.", 403);
    const body = (await request.json()) as Record<string, unknown>;
    const action = String(body.action ?? "");
    const permission = requiredPermission(action);
    if (!permission) return jsonError("지원하지 않는 관리자 요청입니다.");
    if (permission !== "self" && !canAdmin(admin, permission)) {
      return jsonError("슈퍼바이저가 허용하지 않은 관리자 기능입니다.", 403);
    }
    const db = getD1();
    const now = nowIso();
    let actionMessage = "";

    if (action.startsWith("test_data.") && !admin.isSupervisor) {
      return jsonError("슈퍼바이저만 테스트 데이터를 관리할 수 있습니다.", 403);
    }

    if (action === "test_data.seed") {
      await seedTestData({ replace: true });
    } else if (action === "test_data.reset") {
      await resetTestData();
    } else if (action === "admin_account.self_update") {
      if (typeof admin.id !== "number") {
        return jsonError("수정할 관리자 계정을 찾을 수 없습니다.", 404);
      }
      const name = String(body.name ?? "").trim();
      if (name.length < 2 || name.length > 40) {
        return jsonError("관리자 이름은 2~40자로 입력해 주세요.");
      }
      await db
        .prepare(
          `UPDATE admin_accounts
           SET name = ?, updated_at = ?
           WHERE id = ? AND status = 'active'`,
        )
        .bind(name, now, admin.id)
        .run();
      admin.name = name;
    } else if (action === "reward.verify_member") {
      const memberId = Number(body.memberId ?? 0);
      if (!memberId) return jsonError("인증할 회원을 선택해 주세요.");
      await db
        .prepare(
          "UPDATE members SET email_verified = 1, phone_verified = 1 WHERE id = ?",
        )
        .bind(memberId)
        .run();
      await completeReferralVerification(memberId);
    } else if (action === "reward.resolve_flag") {
      const flagId = Number(body.flagId ?? 0);
      const decision = body.decision === "approved" ? "승인" : "차단";
      const flag = await db
        .prepare("SELECT referral_id FROM referral_flags WHERE id = ? AND status = '검토중'")
        .bind(flagId)
        .first<{ referral_id: number }>();
      if (!flag) return jsonError("검토할 의심 추천을 찾을 수 없습니다.");
      const referral = await db
        .prepare("SELECT invitee_id FROM referrals WHERE id = ?")
        .bind(flag.referral_id)
        .first<{ invitee_id: number }>();
      await db.batch([
        db.prepare("UPDATE referral_flags SET status = ?, admin_note = ?, resolved_at = ? WHERE id = ?").bind(decision, String(body.note ?? "").trim(), now, flagId),
        db.prepare("UPDATE referrals SET status = ?, hold_reason = ?, canceled_at = ? WHERE id = ?").bind(decision === "승인" ? "가입완료" : "취소", decision === "승인" ? "이메일·휴대전화 인증 대기" : "관리자 부정이용 차단", decision === "승인" ? null : now, flag.referral_id),
      ]);
      if (decision === "승인" && referral) {
        await completeReferralVerification(referral.invitee_id);
      }
    } else if (action === "admin_account.save") {
      if (!admin.isSupervisor) return jsonError("슈퍼바이저만 관리자 계정을 변경할 수 있습니다.", 403);
      const id = Number(body.id ?? 0);
      const username = String(body.username ?? "").trim().toLowerCase();
      const name = String(body.name ?? "").trim();
      const temporaryPassword = String(body.temporaryPassword ?? "");
      const permissions = parseManagerPermissions(
        body.permissions ?? DEFAULT_MANAGER_PERMISSIONS,
      );
      const forcePasswordChange = body.forcePasswordChange === false ? 0 : 1;
      const status = body.status === "inactive" ? "inactive" : "active";
      if (!validateAdminUsername(username)) {
        return jsonError("아이디는 영문 소문자, 숫자, 점·밑줄·하이픈으로 4자 이상 입력해 주세요.");
      }
      if (name.length < 2 || name.length > 40) {
        return jsonError("관리자 이름은 2~40자로 입력해 주세요.");
      }
      if (!id && !temporaryPassword) {
        return jsonError("새 관리자에게 전달할 임시 비밀번호를 입력해 주세요.");
      }
      if (temporaryPassword && !validateAdminPassword(temporaryPassword)) {
        return jsonError("임시 비밀번호는 영문과 숫자를 포함해 10자 이상 입력해 주세요.");
      }
      if (id) {
        const target = await db
          .prepare("SELECT id, role FROM admin_accounts WHERE id = ?")
          .bind(id)
          .first<{ id: number; role: string }>();
        if (!target) return jsonError("관리자 계정을 찾을 수 없습니다.");
        const storedPermissions =
          target.role === "supervisor"
            ? JSON.stringify(DEFAULT_MANAGER_PERMISSIONS)
            : JSON.stringify(permissions);
        if (temporaryPassword) {
          await db.batch([
            db
              .prepare(
                `UPDATE admin_accounts
                 SET username = ?, name = ?, password_hash = ?, status = ?,
                   permissions = ?, force_password_change = ?, failed_attempts = 0,
                   locked_until = NULL, updated_at = ?
                 WHERE id = ?`,
              )
              .bind(
                username,
                name,
                await hashAdminPassword(temporaryPassword),
                status,
                storedPermissions,
                forcePasswordChange,
                now,
                id,
              ),
            db
              .prepare("DELETE FROM admin_sessions WHERE admin_account_id = ?")
              .bind(id),
          ]);
        } else {
          await db
            .prepare(
              `UPDATE admin_accounts
               SET username = ?, name = ?, permissions = ?, status = ?, updated_at = ?
               WHERE id = ?`,
            )
            .bind(username, name, storedPermissions, status, now, id)
            .run();
          if (status === "inactive") {
            await db
              .prepare("DELETE FROM admin_sessions WHERE admin_account_id = ?")
              .bind(id)
              .run();
          }
        }
      } else {
        await db
          .prepare(
            `INSERT INTO admin_accounts
              (username, name, password_hash, role, permissions, status, force_password_change,
               failed_attempts, locked_until, last_login_at, created_at, updated_at)
             VALUES (?, ?, ?, 'manager', ?, ?, ?, 0, NULL, NULL, ?, ?)`,
          )
          .bind(
            username,
            name,
            await hashAdminPassword(temporaryPassword),
            JSON.stringify(permissions),
            status,
            forcePasswordChange,
            now,
            now,
          )
          .run();
      }
      if (temporaryPassword) {
        const persisted = await db
          .prepare(
            "SELECT password_hash FROM admin_accounts WHERE username = ?",
          )
          .bind(username)
          .first<{ password_hash: string }>();
        if (
          !persisted ||
          !(await verifyAdminPassword(
            temporaryPassword,
            persisted.password_hash,
          ))
        ) {
          throw new Error(
            "비밀번호 저장을 확인하지 못했습니다. 다시 입력해 주세요.",
          );
        }
      }
    } else if (action === "admin_account.status") {
      if (!admin.isSupervisor) return jsonError("슈퍼바이저만 관리자 계정을 변경할 수 있습니다.", 403);
      const id = Number(body.id);
      const status = body.status === "active" ? "active" : "inactive";
      const target = await db
        .prepare("SELECT role FROM admin_accounts WHERE id = ?")
        .bind(id)
        .first<{ role: string }>();
      if (!target) return jsonError("관리자 계정을 찾을 수 없습니다.");
      if (target.role === "supervisor") {
        return jsonError("슈퍼바이저 계정은 사용 중지할 수 없습니다.", 403);
      }
      await db
        .prepare("UPDATE admin_accounts SET status = ?, updated_at = ? WHERE id = ?")
        .bind(status, now, id)
        .run();
      if (status === "inactive") {
        await db
          .prepare("DELETE FROM admin_sessions WHERE admin_account_id = ?")
          .bind(id)
          .run();
      }
    } else if (action === "admin_account.delete") {
      if (!admin.isSupervisor) return jsonError("슈퍼바이저만 관리자 계정을 삭제할 수 있습니다.", 403);
      const id = Number(body.id);
      const target = await db
        .prepare("SELECT role FROM admin_accounts WHERE id = ?")
        .bind(id)
        .first<{ role: string }>();
      if (!target) return jsonError("관리자 계정을 찾을 수 없습니다.");
      if (target.role === "supervisor") {
        return jsonError("슈퍼바이저 계정은 삭제할 수 없습니다.", 403);
      }
      await db.batch([
        db
          .prepare("DELETE FROM admin_sessions WHERE admin_account_id = ?")
          .bind(id),
        db.prepare("DELETE FROM admin_accounts WHERE id = ?").bind(id),
      ]);
    } else if (action === "channel.category.request.review") {
      if (!admin.isSupervisor) return jsonError("채널 카테고리 승인은 최고 관리자만 할 수 있습니다.", 403);
      const id = Math.max(0, Math.floor(Number(body.id ?? 0)));
      const requestId = String(body.requestId ?? "").trim();
      const decision = String(body.decision ?? "").trim();
      const note = String(body.note ?? "").trim().slice(0, 500);
      const channel = await db.prepare("SELECT broadcast_settings, category_settings FROM sales_channels WHERE id = ?").bind(id).first<{ broadcast_settings: string; category_settings: string }>();
      if (!channel) return jsonError("채널을 찾을 수 없습니다.", 404);
      let broadcast: Record<string, any> = {};
      try { broadcast = JSON.parse(String(channel.broadcast_settings || "{}")); } catch { broadcast = {}; }
      const requests = Array.isArray(broadcast.member_category_requests) ? broadcast.member_category_requests : [];
      const target = requests.find((item: any) => String(item.id) === requestId && item.status === "pending");
      if (!target) return jsonError("이미 처리되었거나 찾을 수 없는 요청입니다.", 409);
      if (decision !== "approve" && decision !== "reject") return jsonError("처리 방법을 확인해 주세요.");
      target.status = decision === "approve" ? "approved" : "rejected";
      target.note = note;
      target.reviewedAt = new Date().toISOString();
      broadcast.member_category_requests = requests;
      const now = new Date().toISOString();
      if (decision === "approve") {
        await db.prepare("UPDATE sales_channels SET category_settings = ?, broadcast_settings = ?, updated_at = ? WHERE id = ?")
          .bind(JSON.stringify(Array.isArray(target.categories) ? target.categories : []), JSON.stringify(broadcast), now, id).run();
      } else {
        await db.prepare("UPDATE sales_channels SET broadcast_settings = ?, updated_at = ? WHERE id = ?")
          .bind(JSON.stringify(broadcast), now, id).run();
      }
    } else if (action === "channel.application.review") {
      if (!admin.isSupervisor) return jsonError("채널 신청 승인과 공개 처리는 최고 관리자만 할 수 있습니다.", 403);
      const id = Math.max(0, Math.floor(Number(body.id ?? 0)));
      const decision = String(body.decision ?? "").trim();
      const note = String(body.note ?? "").trim().slice(0, 1000);
      const channel = await db
        .prepare("SELECT id, owner_member_id, application_status FROM sales_channels WHERE id = ?")
        .bind(id)
        .first<{ id: number; owner_member_id: number | null; application_status: string }>();
      if (!channel || !channel.owner_member_id) return jsonError("회원이 신청한 채널을 찾을 수 없습니다.", 404);
      const now = new Date().toISOString();
      if (decision === "approve") {
        await db.prepare(`UPDATE sales_channels SET application_status = 'approved', status = 'draft', admin_review_note = ?, approved_at = ?, updated_at = ? WHERE id = ?`)
          .bind(note, now, now, id).run();
      } else if (decision === "revision") {
        if (!note) return jsonError("수정이 필요한 내용을 적어 주세요.");
        await db.prepare(`UPDATE sales_channels SET application_status = 'revision_requested', status = 'draft', admin_review_note = ?, updated_at = ? WHERE id = ?`)
          .bind(note, now, id).run();
      } else if (decision === "reject") {
        if (!note) return jsonError("반려 사유를 적어 주세요.");
        await db.prepare(`UPDATE sales_channels SET application_status = 'rejected', status = 'draft', admin_review_note = ?, updated_at = ? WHERE id = ?`)
          .bind(note, now, id).run();
      } else if (decision === "publish") {
        if (channel.application_status !== "publication_review" && channel.application_status !== "suspended") {
          return jsonError("회원이 공개 검토를 요청한 채널만 공개할 수 있습니다.");
        }
        await db.prepare(`UPDATE sales_channels SET application_status = 'published', status = 'active', admin_review_note = ?, published_at = ?, updated_at = ? WHERE id = ?`)
          .bind(note, now, now, id).run();
      } else if (decision === "suspend") {
        await db.prepare(`UPDATE sales_channels SET application_status = 'suspended', status = 'inactive', admin_review_note = ?, updated_at = ? WHERE id = ?`)
          .bind(note, now, id).run();
      } else {
        return jsonError("처리 방법을 확인해 주세요.");
      }
    } else if (action === "channel.save") {
      const id = Math.max(0, Math.floor(Number(body.id ?? 0)));
      const ownerMemberId = Math.max(0, Math.floor(Number(body.ownerMemberId ?? 0)));
      const name = String(body.name ?? "").trim().slice(0, 80);
      const requestedSlug = String(body.slug ?? "").trim().toLowerCase();
      const slug = requestedSlug
        .replace(/[^a-z0-9-]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 80);
      const operatorName = String(body.operatorName ?? "").trim().slice(0, 80);
      const description = String(body.description ?? "").trim().slice(0, 500);
      const imageUrl = String(body.imageUrl ?? "").trim().slice(0, 500);
      const avatarImageUrl = imageUrl ? String(body.avatarImageUrl ?? "").trim().slice(0, 500) : "";
      const originalImageUrl = imageUrl ? String(body.originalImageUrl ?? "").trim().slice(0, 500) : "";
      const youtubeUrl = String(body.youtubeUrl ?? "").trim().slice(0, 500);
      const themeColor = /^#[0-9a-f]{6}$/i.test(String(body.themeColor ?? ""))
        ? String(body.themeColor)
        : "#111827";
      const status = body.status === "active" ? "active" : body.status === "inactive" ? "inactive" : "draft";
      const sortOrder = Math.max(0, Math.min(10000, Math.floor(Number(body.sortOrder ?? 0))));
      const requestedShowcaseVisible = body.showcaseVisible !== false;
      const requestedShowcaseOrder = Math.max(0, Math.min(10000, Math.floor(Number(body.showcaseOrder ?? 0))));
      const productIds = Array.from(new Set((Array.isArray(body.productIds) ? body.productIds : [])
        .map(Number)
        .filter((value) => Number.isInteger(value) && value > 0)))
        .slice(0, 10000);
      const categorySettings = (Array.isArray(body.categorySettings) ? body.categorySettings : [])
        .map((raw, index) => {
          const entry = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
          return {
            sourceName: String(entry.sourceName ?? "").trim().slice(0, 80),
            label: String(entry.label ?? entry.sourceName ?? "").trim().slice(0, 80),
            visible: entry.visible !== false,
            sortOrder: Math.max(0, Math.min(1000, Math.floor(Number(entry.sortOrder ?? index)))),
            productIds: Array.from(new Set((Array.isArray(entry.productIds) ? entry.productIds : []).map(Number).filter((value) => Number.isInteger(value) && value > 0))).slice(0, 10000),
            parentSourceName: String(entry.parentSourceName ?? "").trim().slice(0, 80) || undefined,
            assignmentMode: entry.assignmentMode === "auto" ? "auto" : "manual",
            ruleType: entry.ruleType === "brand" ? "brand" : entry.ruleType === "category" ? "category" : undefined,
            ruleValue: String(entry.ruleValue ?? "").trim().slice(0, 80) || undefined,
            ruleCategory: entry.ruleType === "brand" ? String(entry.ruleCategory ?? "").trim().slice(0, 80) || undefined : undefined,
          };
        })
        .filter((entry) => entry.sourceName && entry.label)
        .slice(0, 100);
      const categorySettingsJson = JSON.stringify(categorySettings);
      const rawContactSettings = body.contactSettings && typeof body.contactSettings === "object"
        ? body.contactSettings as Record<string, unknown>
        : {};
      const contactSettingsJson = JSON.stringify({
        use_channel_contact: rawContactSettings.use_channel_contact === true || rawContactSettings.use_channel_contact === "true" ? "true" : "false",
        contact_counselor_name: String(rawContactSettings.contact_counselor_name ?? "").trim().slice(0, 80),
        contact_counselor_image_url: cleanContactUrl(rawContactSettings.contact_counselor_image_url),
        contact_kakao_enabled: rawContactSettings.contact_kakao_enabled === false || rawContactSettings.contact_kakao_enabled === "false" ? "false" : "true",
        contact_kakao_url: cleanContactUrl(rawContactSettings.contact_kakao_url),
        contact_telegram_enabled: rawContactSettings.contact_telegram_enabled === false || rawContactSettings.contact_telegram_enabled === "false" ? "false" : "true",
        contact_telegram_url: cleanContactUrl(rawContactSettings.contact_telegram_url),
        contact_line_enabled: rawContactSettings.contact_line_enabled === false || rawContactSettings.contact_line_enabled === "false" ? "false" : "true",
        contact_line_url: cleanContactUrl(rawContactSettings.contact_line_url),
        contact_live_enabled: rawContactSettings.contact_live_enabled === false || rawContactSettings.contact_live_enabled === "false" ? "false" : "true",
        contact_live_url: cleanContactUrl(rawContactSettings.contact_live_url),
      });
      if (!name) return jsonError("채널명을 입력해 주세요.");
      if (!slug) return jsonError("채널 주소는 영문 소문자와 숫자로 입력해 주세요.");
      if (!ownerMemberId) return jsonError("채널을 운영할 가입 회원을 검색해 선택해 주세요.");
      const ownerMember = await db.prepare("SELECT id, email, name, status FROM members WHERE id = ? LIMIT 1").bind(ownerMemberId).first<Record<string, unknown>>();
      if (!ownerMember || ownerMember.status !== "active") return jsonError("사용 가능한 가입 회원을 찾을 수 없습니다.");
      const occupiedChannel = await db.prepare("SELECT id, name FROM sales_channels WHERE owner_member_id = ? AND id != ? LIMIT 1").bind(ownerMemberId, id).first<Record<string, unknown>>();
      if (occupiedChannel) return jsonError(`${ownerMember.email} 회원은 이미 ${occupiedChannel.name} 채널을 운영하고 있습니다.`, 409);
      if (youtubeUrl && !/^https:\/\/(?:www\.)?(?:youtube\.com|youtu\.be)\//i.test(youtubeUrl)) {
        return jsonError("유튜브 주소를 확인해 주세요.");
      }
      let channelId = id;
      if (id) {
        const exists = await db.prepare("SELECT id, showcase_visible, showcase_order FROM sales_channels WHERE id = ?").bind(id).first<Record<string, unknown>>();
        if (!exists) return jsonError("채널을 찾을 수 없습니다.", 404);
        const showcaseVisible = admin.isSupervisor ? requestedShowcaseVisible : Boolean(exists.showcase_visible);
        const showcaseOrder = admin.isSupervisor ? requestedShowcaseOrder : Number(exists.showcase_order || 0);
        await db.prepare(
          `UPDATE sales_channels SET owner_member_id = ?, slug = ?, name = ?, operator_name = ?, description = ?,
             image_url = ?, avatar_image_url = ?, original_image_url = ?, youtube_url = ?, category_settings = ?, contact_settings = ?, theme_color = ?, status = ?, sort_order = ?,
             showcase_visible = ?, showcase_order = ?, updated_at = ?
           WHERE id = ?`,
        ).bind(ownerMemberId, slug, name, operatorName, description, imageUrl, avatarImageUrl, originalImageUrl, youtubeUrl, categorySettingsJson, contactSettingsJson, themeColor, status, sortOrder, showcaseVisible ? 1 : 0, showcaseOrder, now, id).run();
      } else {
        const showcaseVisible = admin.isSupervisor ? requestedShowcaseVisible : true;
        const showcaseOrder = admin.isSupervisor ? requestedShowcaseOrder : sortOrder;
        const inserted = await db.prepare(
          `INSERT INTO sales_channels
            (slug, name, operator_name, description, image_url, avatar_image_url, original_image_url, youtube_url, category_settings, contact_settings, theme_color, status, sort_order, showcase_visible, showcase_order, owner_member_id, application_status, approved_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved', ?, ?, ?)`,
        ).bind(slug, name, operatorName || String(ownerMember.name || ""), description, imageUrl, avatarImageUrl, originalImageUrl, youtubeUrl, categorySettingsJson, contactSettingsJson, themeColor, status, sortOrder, showcaseVisible ? 1 : 0, showcaseOrder, ownerMemberId, now, now, now).run();
        channelId = Number(inserted.meta.last_row_id);
      }
      await db.batch([
        db.prepare("DELETE FROM sales_channel_products WHERE channel_id = ?").bind(channelId),
        ...productIds.map((productId, index) => db.prepare(
          `INSERT INTO sales_channel_products (channel_id, product_id, featured, sort_order, created_at)
           SELECT ?, id, ?, ?, ? FROM products WHERE id = ? AND status != 'deleted'`,
        ).bind(channelId, index < 8 ? 1 : 0, index, now, productId)),
      ]);
    } else if (action === "channel.status") {
      const id = Math.max(0, Math.floor(Number(body.id ?? 0)));
      const status = body.status === "active" ? "active" : "inactive";
      const changed = await db.prepare("UPDATE sales_channels SET status = ?, updated_at = ? WHERE id = ?")
        .bind(status, now, id).run();
      if (!Number(changed.meta.changes ?? 0)) return jsonError("채널을 찾을 수 없습니다.", 404);
    } else if (action === "channel.delete") {
      const id = Math.max(0, Math.floor(Number(body.id ?? 0)));
      const channel = await db.prepare("SELECT id, name FROM sales_channels WHERE id = ?").bind(id).first<{ id: number; name: string }>();
      if (!channel) return jsonError("채널을 찾을 수 없습니다.", 404);
      const order = await db.prepare("SELECT id FROM orders WHERE channel_id = ? LIMIT 1").bind(id).first();
      if (order) return jsonError("주문 기록이 있는 채널은 삭제할 수 없습니다. 채널을 숨김 처리해 주세요.", 409);
      await db.batch([
        db.prepare("UPDATE carts SET channel_id = NULL, channel_name = '' WHERE channel_id = ?").bind(id),
        db.prepare("DELETE FROM sales_channel_products WHERE channel_id = ?").bind(id),
        db.prepare("DELETE FROM sales_channels WHERE id = ?").bind(id),
      ]);
    } else if (action === "channel.bootstrap") {
      const existing = await db.prepare("SELECT id FROM sales_channels ORDER BY id LIMIT 1").first();
      if (existing) return jsonError("이미 등록된 채널이 있습니다.");
      const settingRows = await db.prepare(
        `SELECT key, value FROM settings WHERE key IN (${channelBroadcastKeys.map(() => "?").join(",")})`,
      ).bind(...channelBroadcastKeys).all();
      const legacy = Object.fromEntries(settingRows.results.map((row) => [String(row.key), String(row.value ?? "")]));
      const inserted = await db.prepare(
        `INSERT INTO sales_channels
          (slug, name, operator_name, description, image_url, youtube_url, broadcast_settings, theme_color, status, sort_order, created_at, updated_at)
         VALUES ('main-live', ?, '', ?, '', ?, ?, '#111827', 'draft', 0, ?, ?)`,
      ).bind(legacy.youtube_live_title || "오르미르", legacy.youtube_live_notice || "", legacy.youtube_live_url || "", JSON.stringify(legacy), now, now).run();
      let legacyProductIds: number[] = [];
      try { legacyProductIds = JSON.parse(legacy.youtube_live_product_ids || "[]"); } catch { legacyProductIds = []; }
      const channelId = Number(inserted.meta.last_row_id);
      await db.batch(legacyProductIds.slice(0, 200).map((productId, index) => db.prepare(
        `INSERT OR IGNORE INTO sales_channel_products (channel_id, product_id, featured, sort_order, created_at)
         SELECT ?, id, ?, ?, ? FROM products WHERE id = ? AND status != 'deleted'`,
      ).bind(channelId, index < 8 ? 1 : 0, index, now, Number(productId))));
    } else if (action === "live.quickProduct") {
      const requestedNumber = Math.max(1, Math.min(9999, Math.floor(Number(body.number ?? 0))));
      const channelId = Math.max(0, Math.floor(Number(body.channelId ?? 0)));
      let current: Record<string, string> = {};
      if (channelId) {
        const row = await db.prepare("SELECT broadcast_settings FROM sales_channels WHERE id = ?").bind(channelId).first<{ broadcast_settings: string }>();
        if (!row) return jsonError("방송 채널을 찾을 수 없습니다.", 404);
        try { current = JSON.parse(row.broadcast_settings || "{}"); } catch { current = {}; }
      } else {
        const rows = await db.prepare("SELECT key, value FROM settings WHERE key IN ('youtube_live_slots', 'youtube_live_history')").all();
        current = Object.fromEntries(rows.results.map((row: Record<string, unknown>) => [String(row.key), String(row.value ?? "")]));
      }
      let slots: Array<{ number: number; productId: number }> = [];
      let history: number[] = [];
      try { slots = JSON.parse(current.youtube_live_slots || "[]"); } catch { slots = []; }
      try { history = JSON.parse(current.youtube_live_history || "[]"); } catch { history = []; }
      const matched = slots.find((slot) => Number(slot.number) === requestedNumber && Number(slot.productId) > 0);
      if (!matched) return jsonError(`${requestedNumber}번에 연결된 상품이 없습니다.`);
      const nextHistory = [...history.filter((number) => Number(number) !== requestedNumber), requestedNumber].slice(-30);
      if (channelId) {
        await db.prepare("UPDATE sales_channels SET broadcast_settings = ?, updated_at = ? WHERE id = ?")
          .bind(JSON.stringify({ ...current, youtube_live_current_number: String(requestedNumber), youtube_live_history: JSON.stringify(nextHistory) }), now, channelId).run();
      } else {
        await db.batch([
          db.prepare(`INSERT INTO settings (key, value, updated_at) VALUES ('youtube_live_current_number', ?, ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`).bind(String(requestedNumber), now),
          db.prepare(`INSERT INTO settings (key, value, updated_at) VALUES ('youtube_live_history', ?, ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`).bind(JSON.stringify(nextHistory), now),
        ]);
      }
    } else if (action === "live.resetHistory") {
      const channelId = Math.max(0, Math.floor(Number(body.channelId ?? 0)));
      if (channelId) {
        const row = await db.prepare("SELECT broadcast_settings FROM sales_channels WHERE id = ?").bind(channelId).first<{ broadcast_settings: string }>();
        if (!row) return jsonError("방송 채널을 찾을 수 없습니다.", 404);
        let current: Record<string, string> = {};
        try { current = JSON.parse(row.broadcast_settings || "{}"); } catch { current = {}; }
        await db.prepare("UPDATE sales_channels SET broadcast_settings = ?, updated_at = ? WHERE id = ?")
          .bind(JSON.stringify({ ...current, youtube_live_current_number: "", youtube_live_history: "[]" }), now, channelId).run();
      } else {
        await db.batch([
          db.prepare(`INSERT INTO settings (key, value, updated_at) VALUES ('youtube_live_current_number', '', ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`).bind(now),
          db.prepare(`INSERT INTO settings (key, value, updated_at) VALUES ('youtube_live_history', '[]', ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`).bind(now),
        ]);
      }
    } else if (action === "live.save") {
      const values = (body.values ?? {}) as Record<string, unknown>;
      const channelId = Math.max(0, Math.floor(Number(body.channelId ?? 0)));
      for (const key of ["youtube_live_slot_numbers", "youtube_live_product_ids", "youtube_live_slots", "youtube_live_history", "youtube_replays", "youtube_shorts"]) {
        try { JSON.parse(String(values[key] ?? "[]")); } catch { return jsonError("라이브 커머스 목록 형식을 확인해 주세요."); }
      }
      const slotNumbers = Array.from(new Set((JSON.parse(String(values.youtube_live_slot_numbers ?? "[]")) as unknown[])
        .map(Number)
        .filter((number) => Number.isInteger(number) && number > 0 && number <= 9999)))
        .slice(0, 500)
        .sort((a, b) => a - b);
      const liveSlots = (JSON.parse(String(values.youtube_live_slots ?? "[]")) as Array<{ number?: unknown; productId?: unknown }>)
        .map((slot) => ({ number: Math.floor(Number(slot.number)), productId: Math.floor(Number(slot.productId)) }))
        .filter((slot) => slotNumbers.includes(slot.number) && slot.productId > 0);
      if (new Set(liveSlots.map((slot) => slot.number)).size !== liveSlots.length) return jsonError("같은 방송 번호를 두 번 사용할 수 없습니다.");
      const duplicateProduct = liveSlots.find((slot, index) => liveSlots.findIndex((item) => item.productId === slot.productId) !== index);
      if (duplicateProduct) {
        const duplicateNumbers = liveSlots.filter((slot) => slot.productId === duplicateProduct.productId).map((slot) => `${slot.number}번`).join(", ");
        return jsonError(`같은 상품은 한 방송에서 중복 연결할 수 없습니다. (${duplicateNumbers})`);
      }
      const replayValues = (JSON.parse(String(values.youtube_replays ?? "[]")) as Array<Record<string, unknown>>)
        .slice(0, 100)
        .map((replay) => ({ ...replay, orientation: replay.orientation === "vertical" ? "vertical" : "horizontal" }));
      const shortsValues = (JSON.parse(String(values.youtube_shorts ?? "[]")) as Array<Record<string, unknown>>)
        .slice(0, 100);
      const shortsProductIds = Array.from(new Set(shortsValues
        .map((short) => Math.floor(Number(short.productId ?? 0)))
        .filter((productId) => productId > 0)));
      const normalized: Record<string, string> = {
        storefront_skin: values.storefront_skin === "youtube" ? "youtube" : "general",
        youtube_live_enabled: values.youtube_live_enabled === "true" ? "true" : "false",
        youtube_live_orientation: values.youtube_live_orientation === "vertical" ? "vertical" : "horizontal",
        youtube_live_title: String(values.youtube_live_title ?? "").trim().slice(0, 100),
        youtube_live_url: String(values.youtube_live_url ?? "").trim().slice(0, 500),
        youtube_live_notice: String(values.youtube_live_notice ?? "").trim().slice(0, 500),
        youtube_live_slot_count: String(slotNumbers.length),
        youtube_live_slot_numbers: JSON.stringify(slotNumbers),
        youtube_live_product_ids: JSON.stringify(liveSlots.map((slot) => slot.productId)),
        youtube_live_slots: JSON.stringify(liveSlots),
        youtube_live_current_number: String(Math.max(0, Math.min(9999, Math.floor(Number(values.youtube_live_current_number ?? 0))))) || "",
        youtube_live_history: String(values.youtube_live_history ?? "[]"),
        youtube_replays: JSON.stringify(replayValues),
        youtube_shorts: JSON.stringify(shortsValues),
      };
      if (channelId) {
        const currentSort = await db.prepare("SELECT COALESCE(MAX(sort_order), -1) AS max_sort FROM sales_channel_products WHERE channel_id = ?")
          .bind(channelId).first<{ max_sort: number }>();
        const changedResults = await db.batch([
          db.prepare("UPDATE sales_channels SET broadcast_settings = ?, youtube_url = ?, updated_at = ? WHERE id = ?")
            .bind(JSON.stringify(normalized), normalized.youtube_live_url, now, channelId),
          ...shortsProductIds.map((productId, index) => db.prepare(
            `INSERT OR IGNORE INTO sales_channel_products (channel_id, product_id, featured, sort_order, created_at)
             SELECT ?, p.id, 0, ?, ? FROM products p WHERE p.id = ? AND p.status = 'active'`,
          ).bind(channelId, Number(currentSort?.max_sort ?? -1) + index + 1, now, productId)),
        ]);
        const changed = changedResults[0];
        if (!Number(changed.meta.changes ?? 0)) return jsonError("방송 채널을 찾을 수 없습니다.", 404);
      } else {
        await db.batch(channelBroadcastKeys.map((key) => db.prepare(
          `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
        ).bind(key, normalized[key], now)));
      }
    } else if (action === "settings.save") {
      const values = (body.values ?? {}) as Record<string, unknown>;
      const googleClientId = String(values.google_client_id ?? "").trim();
      if (
        googleClientId &&
        !/^[0-9]+-[a-z0-9_-]+\.apps\.googleusercontent\.com$/i.test(
          googleClientId,
        )
      ) {
        return jsonError("Google 웹 클라이언트 ID 형식을 확인해 주세요.");
      }
      const boundedReviewSettings: Record<string, string> = {
        review_text_points: String(Math.max(0, Math.min(100000, Number(values.review_text_points ?? 300)))),
        review_photo_points: String(Math.max(0, Math.min(100000, Number(values.review_photo_points ?? 500)))),
        review_write_days: String(Math.max(1, Math.min(365, Number(values.review_write_days ?? 90)))),
        review_min_length: String(Math.max(1, Math.min(1000, Number(values.review_min_length ?? 20)))),
        review_max_images: String(Math.max(0, Math.min(8, Number(values.review_max_images ?? 4)))),
        review_auto_publish: values.review_auto_publish === "false" ? "false" : "true",
      };
      const boundedAttendanceSettings: Record<string, string> = {
        attendance_enabled: values.attendance_enabled === "false" ? "false" : "true",
        attendance_daily_points: String(Math.max(0, Math.min(100000, Number(values.attendance_daily_points ?? 100)))),
        attendance_streak_days: String(Math.max(2, Math.min(31, Number(values.attendance_streak_days ?? 7)))),
        attendance_streak_bonus: String(Math.max(0, Math.min(1000000, Number(values.attendance_streak_bonus ?? 500)))),
      };
      const boundedReferralSettings: Record<string, string> = {
        referral_enabled: values.referral_enabled === "false" ? "false" : "true",
        referral_join_reward: String(Math.max(0, Math.min(100000, Number(values.referral_join_reward ?? 500)))),
        referral_first_order_inviter_reward: String(Math.max(0, Math.min(1000000, Number(values.referral_first_order_inviter_reward ?? 1000)))),
        referral_first_order_friend_reward: String(Math.max(0, Math.min(1000000, Number(values.referral_first_order_friend_reward ?? 1000)))),
        referral_min_order_points: String(Math.max(0, Math.min(10000000, Number(values.referral_min_order_points ?? 30000)))),
        referral_hold_days: String(Math.max(0, Math.min(90, Number(values.referral_hold_days ?? 7)))),
        referral_cookie_days: String(Math.max(1, Math.min(365, Number(values.referral_cookie_days ?? 30)))),
        referral_monthly_cap: String(Math.max(0, Math.min(10000000, Number(values.referral_monthly_cap ?? 30000)))),
        referral_reward_expiry_days: String(Math.max(1, Math.min(3650, Number(values.referral_reward_expiry_days ?? 365)))),
      };
      const boundedOperationSettings: Record<string, string> = {
        feature_shipping_enabled: values.feature_shipping_enabled === "true" ? "true" : "false",
        shipping_base_fee: String(Math.max(0, Math.min(1000000, Number(values.shipping_base_fee ?? 3000)))),
        shipping_free_threshold: String(Math.max(0, Math.min(100000000, Number(values.shipping_free_threshold ?? 50000)))),
        shipping_remote_fee: String(Math.max(0, Math.min(1000000, Number(values.shipping_remote_fee ?? 3000)))),
        shipping_return_fee: String(Math.max(0, Math.min(1000000, Number(values.shipping_return_fee ?? 6000)))),
        shipping_exchange_fee: String(Math.max(0, Math.min(1000000, Number(values.shipping_exchange_fee ?? 6000)))),
        feature_home_display_enabled: values.feature_home_display_enabled === "true" ? "true" : "false",
        feature_variant_stock_enabled: values.feature_variant_stock_enabled === "true" ? "true" : "false",
        feature_member_tiers_enabled: values.feature_member_tiers_enabled === "true" ? "true" : "false",
        feature_discount_enabled: values.feature_discount_enabled === "true" ? "true" : "false",
        period_discount_rate: String(Math.max(0, Math.min(100, Number(values.period_discount_rate ?? 0)))),
        feature_templates_enabled: values.feature_templates_enabled === "true" ? "true" : "false",
        feature_statistics_enabled: values.feature_statistics_enabled === "true" ? "true" : "false",
      };
      for (const [key, fallback] of [["home_display_sections", "[]"], ["member_tiers", "[]"]] as const) {
        try { JSON.parse(String(values[key] ?? fallback)); } catch { return jsonError(`${key === "home_display_sections" ? "홈 진열" : "회원등급"} 설정을 확인해 주세요.`); }
      }
      Object.assign(values, boundedReviewSettings, boundedAttendanceSettings, boundedReferralSettings, boundedOperationSettings);
      const entries = Object.entries(values).filter(([key]) => editableSettings.has(key));
      await db.batch(
        entries.map(([key, value]) =>
          db
            .prepare(
              `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
               ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
            )
            .bind(key, String(value ?? ""), now),
        ),
      );
    } else if (action === "product.catalog") {
      const cleanList = (value: unknown, limit = 30) =>
        Array.from(
          new Set(
            (Array.isArray(value) ? value : [])
              .map((item) => String(item).trim())
              .filter((item) => item.length >= 1 && item.length <= 30),
          ),
        ).slice(0, limit);
      const cleanBrandList = (value: unknown, limit = 500) => {
        const unique = new Map<string, string>();
        for (const raw of Array.isArray(value) ? value : []) {
          const brand = String(raw || "").normalize("NFKC").replace(/\s+/g, " ").trim();
          if (!brand || brand.length > 80) continue;
          const key = brand.toLocaleUpperCase("en-US");
          if (!unique.has(key)) unique.set(key, brand);
        }
        return Array.from(unique.values()).slice(0, limit);
      };
      const currentSettings = await db.prepare("SELECT key, value FROM settings WHERE key IN ('product_categories', 'product_category_config')").all();
      const currentValues = Object.fromEntries(currentSettings.results.map((row: Record<string, unknown>) => [String(row.key), String(row.value)]));
      let legacyCategories: string[] = [];
      try { legacyCategories = cleanList(JSON.parse(currentValues.product_categories || "[]")); } catch { legacyCategories = []; }
      const currentConfig = parseCategoryConfig(currentValues.product_category_config, legacyCategories);
      const rawConfig = body.categoryConfig && typeof body.categoryConfig === "object" ? body.categoryConfig as Record<string, unknown> : null;
      const incomingCategories = Array.isArray(rawConfig?.categories) ? rawConfig.categories : [];
      const categoryConfig = rawConfig ? {
        menuLimit: Math.max(5, Math.min(10, Number(rawConfig.menuLimit || 7))),
        categories: incomingCategories.slice(0, 20).map((rawEntry: unknown, index: number) => {
          const entry = rawEntry && typeof rawEntry === "object" ? rawEntry as Record<string, unknown> : {};
          const rawChildren = Array.isArray(entry.children) ? entry.children : [];
          return {
            id: String(entry.id || `category-${index + 1}`).slice(0, 60),
            name: String(entry.name || "").trim().slice(0, 30),
            visible: entry.visible !== false,
            children: rawChildren.slice(0, 20).map((rawChild: unknown, childIndex: number) => {
              const child = rawChild && typeof rawChild === "object" ? rawChild as Record<string, unknown> : {};
              return {
                id: String(child.id || `child-${index + 1}-${childIndex + 1}`).slice(0, 60),
                name: String(child.name || "").trim().slice(0, 30),
                visible: child.visible !== false,
                children: (Array.isArray(child.children) ? child.children : []).slice(0, 20).map((rawGrandchild: unknown, grandchildIndex: number) => {
                  const grandchild = rawGrandchild && typeof rawGrandchild === "object" ? rawGrandchild as Record<string, unknown> : {};
                  return {
                    id: String(grandchild.id || `grandchild-${index + 1}-${childIndex + 1}-${grandchildIndex + 1}`).slice(0, 60),
                    name: String(grandchild.name || "").trim().slice(0, 30),
                    visible: grandchild.visible !== false,
                  };
                }).filter((grandchild) => grandchild.name),
              };
            }).filter((child) => child.name),
          };
        }).filter((entry) => entry.name),
      } : null;
      const categories = categoryConfig ? selectableCategoryNames(categoryConfig) : cleanList(body.categories);
      // Clothing and accessory catalogs can require many distinct brands.
      // Keep a generous safety bound while avoiding the previous 30-brand truncation.
      const brands = cleanBrandList(body.brands, 500);
      const rawBrandMoves = Array.isArray(body.brandMoves) ? body.brandMoves : [];
      const brandMoves = rawBrandMoves.slice(0, 500).map((rawMove: unknown) => {
        const move = rawMove && typeof rawMove === "object" ? rawMove as Record<string, unknown> : {};
        return {
          from: String(move.from || "").normalize("NFKC").replace(/\s+/g, " ").trim(),
          to: String(move.to || "").normalize("NFKC").replace(/\s+/g, " ").trim(),
        };
      }).filter((move) => move.from && move.to && move.from !== move.to);
      const allowedBrandKeys = new Set(brands.map((brand) => brand.toLocaleUpperCase("en-US")));
      if (brandMoves.some((move) => !allowedBrandKeys.has(move.to.toLocaleUpperCase("en-US")))) {
        return jsonError("이동할 대상 브랜드가 현재 브랜드 목록에 없습니다. 화면을 새로고침한 뒤 다시 시도해 주세요.");
      }
      const validTopCategories = new Set((categoryConfig?.categories || []).map((entry) => entry.name));
      const rawBrandGroups = body.brandGroups && typeof body.brandGroups === "object"
        ? body.brandGroups as Record<string, unknown>
        : {};
      const brandGroups = Object.fromEntries(brands.map((brand) => {
        const groups = Array.isArray(rawBrandGroups[brand])
          ? Array.from(new Set((rawBrandGroups[brand] as unknown[])
            .map((value) => String(value || "").trim())
            .filter((value) => validTopCategories.has(value))))
          : [];
        return [brand, groups];
      }));
      if (!categories.length) {
        return jsonError("상품 분류를 한 개 이상 입력해 주세요.");
      }
      const allNames = categoryConfig ? selectableCategoryNames(categoryConfig) : categories;
      if (new Set(allNames.map((name: string) => name.toLowerCase())).size !== allNames.length) {
        return jsonError("대분류와 하위 분류의 이름은 서로 다르게 입력해 주세요.");
      }
      if (categoryConfig) {
        const indexedCategories = (config: typeof categoryConfig) => new Map(config.categories.flatMap((entry) => [
          [entry.id, { name: entry.name, parent: entry.name, child: false }] as const,
          ...entry.children.flatMap((child) => [
            [child.id, { name: child.name, parent: entry.name, child: true }] as const,
            ...child.children.map((grandchild) => [grandchild.id, { name: grandchild.name, parent: entry.name, child: true }] as const),
          ]),
        ]));
        const oldById = indexedCategories(currentConfig);
        const newById = indexedCategories(categoryConfig);
        const removedNames = Array.from(oldById.entries()).filter(([id]) => !newById.has(id)).map(([, value]) => value.name);
        if (removedNames.length) {
          const placeholders = removedNames.map(() => "?").join(",");
          const used = await db.prepare(
            `SELECT p.category, d.subcategory
             FROM products p LEFT JOIN product_catalog_details d ON d.product_id = p.id
             WHERE p.status != 'deleted'
               AND (p.category IN (${placeholders}) OR d.subcategory IN (${placeholders}))
             LIMIT 20`,
          ).bind(...removedNames, ...removedNames).all();
          if (used.results.length) {
            return jsonError(`상품이 연결된 분류는 삭제할 수 없습니다: ${removedNames.join(", ")}. 먼저 상품을 다른 분류로 이동해 주세요.`);
          }
        }
        for (const [id, oldValue] of oldById) {
          const newValue = newById.get(id);
          if (!newValue) continue;
          if (!oldValue.child && (newValue.name !== oldValue.name || newValue.parent !== oldValue.parent)) {
            await db.prepare("UPDATE products SET category = ? WHERE category = ? AND status != 'deleted'").bind(newValue.parent, oldValue.name).run();
          } else if (oldValue.child && (newValue.name !== oldValue.name || newValue.parent !== oldValue.parent)) {
            await db.prepare("UPDATE product_catalog_details SET subcategory = ? WHERE subcategory = ?").bind(newValue.name, oldValue.name).run();
            await db.prepare("UPDATE products SET category = ? WHERE category = ? AND status != 'deleted'").bind(newValue.parent, oldValue.name).run();
            await db.prepare(
              `UPDATE products SET category = ?
               WHERE status != 'deleted' AND id IN (
                 SELECT product_id FROM product_catalog_details WHERE subcategory = ?
               )`,
            ).bind(newValue.parent, newValue.name).run();
          }
        }
      }
      await db.batch([
        ...brandMoves.map((move) => db.prepare(
          `UPDATE products SET brand = ?
           WHERE status != 'deleted' AND UPPER(TRIM(brand)) = UPPER(TRIM(?))`,
        ).bind(move.to, move.from)),
        db
          .prepare(
            `INSERT INTO settings (key, value, updated_at) VALUES ('product_categories', ?, ?)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
          )
          .bind(JSON.stringify(categories), now),
        ...(categoryConfig ? [db
          .prepare(
            `INSERT INTO settings (key, value, updated_at) VALUES ('product_category_config', ?, ?)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
          )
          .bind(JSON.stringify(categoryConfig), now)] : []),
        db
          .prepare(
            `INSERT INTO settings (key, value, updated_at) VALUES ('product_brands', ?, ?)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
          )
          .bind(JSON.stringify(brands), now),
        db
          .prepare(
            `INSERT INTO settings (key, value, updated_at) VALUES ('product_brand_groups', ?, ?)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
          )
          .bind(JSON.stringify(brandGroups), now),
      ]);
    } else if (action === "product.category_move") {
      const from = String(body.from ?? "").trim();
      const to = String(body.to ?? "").trim();
      if (!from || !to || from === to) return jsonError("이동할 이전 분류와 새 분류를 선택해 주세요.");
      const categorySettings = await db.prepare("SELECT key, value FROM settings WHERE key IN ('product_categories', 'product_category_config')").all();
      const categoryValues = Object.fromEntries(categorySettings.results.map((row: Record<string, unknown>) => [String(row.key), String(row.value)]));
      let legacyNames: string[] = [];
      try { legacyNames = JSON.parse(categoryValues.product_categories || "[]"); } catch { legacyNames = []; }
      const configuredCategories = parseCategoryConfig(categoryValues.product_category_config, legacyNames);
      const allowedNames = selectableCategoryNames(configuredCategories);
      if (!allowedNames.includes(to)) return jsonError("이동할 새 분류가 현재 분류 목록에 없습니다.");
      const fromEntry = categoryEntryFor(configuredCategories, from);
      const toEntry = categoryEntryFor(configuredCategories, to);
      if (!fromEntry || !toEntry) return jsonError("이동할 분류를 다시 확인해 주세요.");
      const fromChild = fromEntry.children.find((child) => child.name === from);
      const descendantNames = fromEntry.name === from
        ? fromEntry.children.flatMap((child) => [child.name, ...child.children.map((grandchild) => grandchild.name)])
        : fromChild?.children.map((grandchild) => grandchild.name) ?? [];
      if (descendantNames.includes(to)) {
        return jsonError("상위 분류의 상품을 그 안의 하위 분류로 옮기면 상위 분류를 삭제할 수 없습니다. 삭제하려면 현재 분류 밖의 다른 분류를 선택해 주세요.");
      }
      const fromIsParent = fromEntry.name === from;
      const toIsParent = toEntry.name === to;
      const targetIds = fromIsParent
        ? await db.prepare("SELECT id FROM products WHERE status != 'deleted' AND category = ?").bind(from).all<{ id: number }>()
        : await db.prepare(
            `SELECT p.id FROM products p LEFT JOIN product_catalog_details d ON d.product_id = p.id
             WHERE p.status != 'deleted' AND (p.category = ? OR (p.category = ? AND d.subcategory = ?))`,
          ).bind(from, fromEntry.name, from).all<{ id: number }>();
      const ids = targetIds.results.map((row) => Number(row.id));
      if (ids.length) {
        const placeholders = ids.map(() => "?").join(",");
        await db.prepare(`UPDATE products SET category = ? WHERE id IN (${placeholders})`).bind(toEntry.name, ...ids).run();
        const targetSubcategory = toIsParent ? "" : to;
        const targetProductType = guessProductType(toEntry.name);
        await db.batch(ids.map((productId) => db.prepare(
          `INSERT INTO product_catalog_details
            (product_id, name_en, subcategory, product_type, sale_price, points_price,
             featured, type_fields_json, search_sources_json, thumbnail_url,
             source_kind, source_reference, created_at, updated_at)
           VALUES (?, '', ?, ?, 0, 0, 0, '{}', '[]', '', 'manual', '', ?, ?)
           ON CONFLICT(product_id) DO UPDATE SET
             subcategory = excluded.subcategory,
             updated_at = excluded.updated_at`,
        ).bind(productId, targetSubcategory, targetProductType, now, now)));
      }
      const remaining = fromIsParent
        ? await db.prepare("SELECT COUNT(*) AS count FROM products WHERE status != 'deleted' AND category = ?").bind(from).first<{ count: number }>()
        : await db.prepare(
            `SELECT COUNT(*) AS count FROM products p LEFT JOIN product_catalog_details d ON d.product_id = p.id
             WHERE p.status != 'deleted' AND (p.category = ? OR (p.category = ? AND d.subcategory = ?))`,
          ).bind(from, fromEntry.name, from).first<{ count: number }>();
      const remainingCount = Number(remaining?.count || 0);
      if (remainingCount > 0) {
        return jsonError(`${ids.length}개를 이동했지만 이전 분류에 ${remainingCount}개가 남았습니다. 상품 자료를 확인해 주세요.`, 409);
      }
      actionMessage = `${ids.length}개 상품을 ${to}(으)로 이동했습니다. 이전 분류에는 남은 상품이 없습니다.`;
    } else if (action === "product.save") {
      const id = Number(body.id ?? 0);
      const name = String(body.name ?? "").trim();
      const nameEn = String(body.nameEn ?? "").trim().slice(0, 140);
      const category = String(body.category ?? "기타").trim();
      const subcategory = String(body.subcategory ?? "").trim().slice(0, 60);
      const productType = normalizeProductType(body.productType);
      const typeFields = cleanProductTypeFields(productType, body.typeFields);
      const brand = String(body.brand ?? "").trim();
      const productCode = String(body.productCode ?? "").trim().slice(0, 60);
      const styleNumber = String(body.styleNumber ?? "").trim().slice(0, 80);
      const description = String(body.description ?? "").trim();
      const imageUrl = String(body.imageUrl ?? "").trim();
      const imageUrls = cleanImageUrls(body.imageUrls);
      const media = cleanProductMedia(body.media, imageUrl, imageUrls, name);
      const coverImage = String(media[0]?.url ?? imageUrl);
      const galleryImages = media.slice(1).map((entry) => String(entry?.url ?? ""));
      const optionsJson = JSON.stringify(parseOptionLines(body.optionText));
      const rawVariants = Array.isArray(body.variants) ? body.variants : [];
      const variants = rawVariants.slice(0, 200).map((raw) => {
        const entry = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
        const options = entry.options && typeof entry.options === "object" ? Object.fromEntries(Object.entries(entry.options as Record<string, unknown>).map(([key, value]) => [String(key).slice(0, 30), String(value).slice(0, 60)])) : {};
        return { key: String(entry.key || "").slice(0, 240), options, sku: String(entry.sku || "").trim().slice(0, 60), stock: Math.max(0, Math.floor(Number(entry.stock || 0))), additionalPrice: Math.max(-100000000, Math.min(100000000, Math.floor(Number(entry.additionalPrice || 0)))), active: entry.active !== false };
      }).filter((entry) => entry.key && Object.keys(entry.options).length);
      const variantsJson = JSON.stringify(variants);
      const detailContent = String(body.detailContent ?? "").trim();
      const shippingInfo = String(body.shippingInfo ?? "").trim();
      const pointPrice = Math.max(0, Number(body.pointPrice ?? 0));
      const pointUsageMode = ["none", "partial", "full"].includes(String(body.pointUsageMode))
        ? String(body.pointUsageMode)
        : "full";
      const pointMaxPercent = pointUsageMode === "none"
        ? 0
        : pointUsageMode === "full"
          ? 100
          : Math.max(1, Math.min(99, Number(body.pointMaxPercent ?? 50)));
      const cashPaymentEnabled = body.cashPaymentEnabled === false ? 0 : 1;
      const rewardOnCashOnly = body.rewardOnCashOnly === false ? 0 : 1;
      const stock = variants.length ? variants.filter((entry) => entry.active).reduce((sum, entry) => sum + entry.stock, 0) : Math.max(0, Number(body.stock ?? 0));
      const status = body.status === "inactive"
        ? "inactive"
        : body.status === "draft"
          ? "draft"
          : "active";
      const requestedBadge = String(body.badge ?? "").trim().slice(0, 16);
      const badge = ["", "신상품", "인기상품", "세일", "추천", "한정"].includes(requestedBadge)
        ? requestedBadge
        : "";
      const categorySettings = await db.prepare("SELECT key, value FROM settings WHERE key IN ('product_categories', 'product_category_config')").all();
      const categoryValues = Object.fromEntries(categorySettings.results.map((row: Record<string, unknown>) => [String(row.key), String(row.value)]));
      let legacyNames: string[] = [];
      try { legacyNames = JSON.parse(categoryValues.product_categories || "[]"); } catch { legacyNames = []; }
      const configuredCategories = parseCategoryConfig(categoryValues.product_category_config, legacyNames);
      const selectedCategory = categoryEntryFor(configuredCategories, category);
      if (!selectedCategory || selectedCategory.name !== category) {
        return jsonError("등록된 대분류를 선택해 주세요.");
      }
      if (subcategory && !selectedCategory.children.some((child) => child.name === subcategory)) {
        return jsonError("선택한 대분류에 연결된 하위 분류를 선택해 주세요.");
      }
      if (status !== "draft") {
        const missing = [
          !name && "상품명",
          !productCode && "상품코드",
          !styleNumber && "품번",
          media.length < 1 && "상품사진 1장 이상",
          !pointPrice && "판매가",
        ].filter(Boolean);
        if (missing.length) {
          return jsonError(`판매 저장 전 다음 항목을 확인해 주세요: ${missing.join(", ")}`);
        }
      }
      if (!cashPaymentEnabled && (pointUsageMode !== "full" || pointMaxPercent !== 100)) {
        return jsonError("현금 결제를 막으려면 리워드 전액(100%) 결제가 가능해야 합니다.");
      }
      if (productCode) {
        const duplicate = await db
          .prepare(
            `SELECT id FROM products
             WHERE lower(product_code) = lower(?) AND status != 'deleted' AND id != ?
             LIMIT 1`,
          )
          .bind(productCode, id || -1)
          .first<{ id: number }>();
        if (duplicate) return jsonError("이미 사용 중인 상품 코드(SKU)입니다.");
      }
      if (styleNumber) {
        const duplicate = await db
          .prepare(
            `SELECT id FROM products
             WHERE lower(style_number) = lower(?) AND status != 'deleted' AND id != ?
             LIMIT 1`,
          )
          .bind(styleNumber, id || -1)
          .first<{ id: number }>();
        if (duplicate) return jsonError("이미 등록된 품번입니다.");
      }
      let savedProductId = id;
      if (id) {
        await db
          .prepare(
            `UPDATE products SET
              name = ?, category = ?, brand = ?, product_code = ?, style_number = ?,
              description = ?, image_url = ?, image_urls = ?, media_json = ?, options_json = ?, variants_json = ?,
              detail_content = ?, shipping_info = ?,
              point_price = ?, point_usage_mode = ?, point_max_percent = ?,
              cash_payment_enabled = ?, reward_on_cash_only = ?, stock = ?, status = ?, badge = ?
             WHERE id = ?`,
          )
          .bind(
            name,
            category,
            brand,
            productCode,
            styleNumber,
            description,
            coverImage,
            JSON.stringify(galleryImages),
            JSON.stringify(media),
            optionsJson,
            variantsJson,
            detailContent,
            shippingInfo,
            pointPrice,
            pointUsageMode,
            pointMaxPercent,
            cashPaymentEnabled,
            rewardOnCashOnly,
            stock,
            status,
            badge,
            id,
          )
          .run();
      } else {
        const inserted = await db
          .prepare(
            `INSERT INTO products
              (name, category, brand, product_code, style_number, description, image_url,
               image_urls, media_json, options_json, variants_json, detail_content, shipping_info,
               point_price, point_usage_mode, point_max_percent,
               cash_payment_enabled, reward_on_cash_only,
               stock, status, badge, sales_count, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
          )
          .bind(
            name,
            category,
            brand,
            productCode,
            styleNumber,
            description,
            coverImage,
            JSON.stringify(galleryImages),
            JSON.stringify(media),
            optionsJson,
            variantsJson,
            detailContent,
            shippingInfo,
            pointPrice,
            pointUsageMode,
            pointMaxPercent,
            cashPaymentEnabled,
            rewardOnCashOnly,
            stock,
            status,
            badge,
            now,
          )
          .run();
        savedProductId = Number(inserted.meta.last_row_id || 0);
      }
      if (savedProductId > 0) {
        await db.prepare(
          `INSERT INTO product_catalog_details
            (product_id, name_en, subcategory, product_type, sale_price, points_price,
             featured, type_fields_json, search_sources_json, thumbnail_url,
             source_kind, source_reference, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, 0, ?, '[]', ?, 'manual', '', ?, ?)
           ON CONFLICT(product_id) DO UPDATE SET
             name_en = excluded.name_en,
             subcategory = excluded.subcategory,
             product_type = excluded.product_type,
             sale_price = excluded.sale_price,
             points_price = excluded.points_price,
             type_fields_json = excluded.type_fields_json,
             thumbnail_url = excluded.thumbnail_url,
             source_kind = 'manual',
             updated_at = excluded.updated_at`,
        ).bind(
          savedProductId,
          nameEn,
          subcategory,
          productType,
          pointPrice,
          pointPrice,
          JSON.stringify(typeFields),
          coverImage,
          now,
          now,
        ).run();
      }
    } else if (action === "product.bulk_payment_policy") {
      const ids = Array.from(
        new Set(
          (Array.isArray(body.ids) ? body.ids : [])
            .map(Number)
            .filter((id) => Number.isInteger(id) && id > 0),
        ),
      ).slice(0, 100);
      if (!ids.length) return jsonError("변경할 상품을 선택해 주세요.");
      const mode = ["none", "partial", "full"].includes(String(body.pointUsageMode))
        ? String(body.pointUsageMode)
        : "full";
      const percent = mode === "none"
        ? 0
        : mode === "full"
          ? 100
          : Math.max(1, Math.min(99, Number(body.pointMaxPercent ?? 50)));
      const cashEnabled = body.cashPaymentEnabled === false ? 0 : 1;
      const cashOnlyReward = body.rewardOnCashOnly === false ? 0 : 1;
      if (!cashEnabled && (mode !== "full" || percent !== 100)) {
        return jsonError("현금 결제를 막으려면 리워드 전액(100%) 결제가 가능해야 합니다.");
      }
      await db.batch(
        ids.map((id) =>
          db
            .prepare(
              `UPDATE products SET point_usage_mode = ?, point_max_percent = ?,
                 cash_payment_enabled = ?, reward_on_cash_only = ?
               WHERE id = ? AND status != 'deleted'`,
            )
            .bind(mode, percent, cashEnabled, cashOnlyReward, id),
        ),
      );
    } else if (action === "product.bulk_status") {
      const ids = Array.from(
        new Set(
          (Array.isArray(body.ids) ? body.ids : [])
            .map(Number)
            .filter((id) => Number.isInteger(id) && id > 0),
        ),
      ).slice(0, 100);
      if (!ids.length) return jsonError("변경할 상품을 선택해 주세요.");
      const status = body.status === "inactive" ? "inactive" : "active";
      await db.batch(
        ids.map((id) =>
          db
            .prepare("UPDATE products SET status = ? WHERE id = ? AND status != 'deleted'")
            .bind(status, id),
        ),
      );
    } else if (action === "product.bulk_delete") {
      const ids = Array.from(
        new Set(
          (Array.isArray(body.ids) ? body.ids : [])
            .map(Number)
            .filter((id) => Number.isInteger(id) && id > 0),
        ),
      ).slice(0, 100);
      if (!ids.length) return jsonError("삭제할 상품을 선택해 주세요.");
      const placeholders = ids.map(() => "?").join(",");
      const selectedRows = await db
        .prepare(`SELECT id FROM products WHERE status != 'deleted' AND id IN (${placeholders})`)
        .bind(...ids)
        .all<{ id: number }>();
      if (selectedRows.results.length !== ids.length) {
        return jsonError("선택 상품이 변경되었습니다. 목록을 새로 확인한 뒤 다시 선택해 주세요.", 409);
      }
      await db
        .prepare(`UPDATE products SET status = 'deleted' WHERE status != 'deleted' AND id IN (${placeholders})`)
        .bind(...ids)
        .run();
    } else if (action === "product.status") {
      await db
        .prepare("UPDATE products SET status = ? WHERE id = ?")
        .bind(body.status === "active" ? "active" : "inactive", Number(body.id))
        .run();
    } else if (action === "product.delete") {
      const id = Number(body.id);
      if (!Number.isInteger(id) || id < 1) return jsonError("삭제할 상품을 다시 선택해 주세요.");
      const deleted = await db
        .prepare("UPDATE products SET status = 'deleted' WHERE id = ? AND status != 'deleted'")
        .bind(id)
        .run();
      if (!Number(deleted.meta.changes ?? 0)) return jsonError("이미 삭제됐거나 존재하지 않는 상품입니다.", 409);
    } else if (action === "member.save") {
      const id = Number(body.id ?? 0);
      const email = String(body.email ?? "").trim().toLowerCase();
      const name = String(body.name ?? "").trim();
      const phone = String(body.phone ?? "").trim();
      const role = "member";
      const status = body.status === "suspended" ? "suspended" : "active";
      const points = Math.max(0, Number(body.points ?? 0));
      const temporaryPassword = String(body.temporaryPassword ?? "");
      if (!email || !name) return jsonError("회원 이름과 이메일을 입력해 주세요.");
      if ((!id || temporaryPassword) && !validateAdminPassword(temporaryPassword)) {
        return jsonError("임시 비밀번호는 영문과 숫자를 포함해 10자 이상 입력해 주세요.");
      }
      if (id) {
        await db
          .prepare(
            `UPDATE members
             SET email = ?, name = ?, phone = ?, role = ?, status = ?
             WHERE id = ?`,
          )
          .bind(email, name, phone, role, status, id)
          .run();
        if (status === "suspended") {
          await db.prepare("DELETE FROM member_sessions WHERE member_id = ?").bind(id).run();
        }
        if (temporaryPassword) {
          await db.batch([
            db
              .prepare(
                `INSERT INTO member_credentials
                  (member_id, password_hash, failed_attempts, locked_until, updated_at)
                 VALUES (?, ?, 0, NULL, ?)
                 ON CONFLICT(member_id) DO UPDATE SET
                   password_hash = excluded.password_hash,
                   failed_attempts = 0,
                   locked_until = NULL,
                   updated_at = excluded.updated_at`,
              )
              .bind(id, await hashAdminPassword(temporaryPassword), now),
            db.prepare("DELETE FROM member_sessions WHERE member_id = ?").bind(id),
            db.prepare("UPDATE password_reset_requests SET status = 'completed', completed_at = ? WHERE member_id = ? AND status = 'pending'").bind(now, id),
          ]);
        }
      } else {
        const result = await db
          .prepare(
            `INSERT INTO members
              (email, name, role, status, points, charge_points, reward_points, phone, joined_at)
             VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)`,
          )
          .bind(email, name, role, status, points, points, phone, now)
          .run();
        const memberId = Number(result.meta.last_row_id);
        await db
          .prepare(
            `INSERT INTO member_credentials
              (member_id, password_hash, failed_attempts, locked_until, updated_at)
             VALUES (?, ?, 0, NULL, ?)`,
          )
          .bind(memberId, await hashAdminPassword(temporaryPassword), now)
          .run();
        if (points) {
          await db
            .prepare(
              `INSERT INTO point_logs
                (member_id, amount, type, memo, balance_after, created_at, point_bucket)
               VALUES (?, ?, '리워드지급', '관리자 신규 회원 지급', ?, ?, 'reward')`,
            )
            .bind(memberId, points, points, now)
            .run();
        }
      }
    } else if (action === "member.bulk_status") {
      const ids = Array.from(
        new Set(
          (Array.isArray(body.ids) ? body.ids : [])
            .map(Number)
            .filter((id) => Number.isInteger(id) && id > 0),
        ),
      ).slice(0, 100);
      if (!ids.length) return jsonError("변경할 회원을 선택해 주세요.");
      const status = body.status === "suspended" ? "suspended" : "active";
      await db.batch([
        ...ids.map((id) =>
          db.prepare("UPDATE members SET status = ? WHERE id = ?").bind(status, id),
        ),
        ...(status === "suspended"
          ? ids.map((id) =>
              db.prepare("DELETE FROM member_sessions WHERE member_id = ?").bind(id),
            )
          : []),
      ]);
    } else if (action === "member.point") {
      const memberId = Number(body.memberId);
      const amount = Number(body.amount ?? 0);
      const memo = String(body.memo ?? "관리자 수동 조정").trim();
      if (!amount) return jsonError("조정할 리워드를 입력해 주세요.");
      const target = await db
        .prepare("SELECT points, reward_points FROM members WHERE id = ?")
        .bind(memberId)
        .first<{ points: number; reward_points: number }>();
      if (!target) return jsonError("회원을 찾을 수 없습니다.");
      if (target.points + amount < 0 || target.reward_points + amount < 0) return jsonError("혜택 리워드 잔액은 0보다 작을 수 없습니다.");
      const adjusted = await db.prepare("UPDATE members SET points = points + ?, reward_points = reward_points + ? WHERE id = ? AND points + ? >= 0 AND reward_points + ? >= 0").bind(amount, amount, memberId, amount, amount).run();
      if (!Number(adjusted.meta.changes ?? 0)) return jsonError("리워드 잔액이 변경되었습니다. 다시 확인해 주세요.", 409);
      await db.prepare(`INSERT INTO point_logs (member_id, amount, type, memo, balance_after, created_at, point_bucket) SELECT ?, ?, ?, ?, points, ?, 'reward' FROM members WHERE id = ?`).bind(memberId, amount, amount > 0 ? "지급" : "차감", memo, now, memberId).run();
    } else if (action === "member.status") {
      const memberId = Number(body.id);
      const status = body.status === "active" ? "active" : "suspended";
      await db.batch([
        db.prepare("UPDATE members SET status = ? WHERE id = ?").bind(status, memberId),
        ...(status === "suspended"
          ? [db.prepare("DELETE FROM member_sessions WHERE member_id = ?").bind(memberId)]
          : []),
      ]);
    } else if (action === "order.payment_confirm") {
      const orderId = Number(body.id);
      const target = await db
        .prepare(
          `SELECT o.*, m.points, m.charge_points, m.reward_points
           FROM orders o JOIN members m ON m.id = o.member_id
           WHERE o.id = ?`,
        )
        .bind(orderId)
        .first<Record<string, unknown>>();
      if (!target) return jsonError("주문을 찾을 수 없습니다.");
      if (!["awaiting_cash", "awaiting_kakao"].includes(String(target.payment_status)) || target.point_reservation_status !== "reserved") {
        return jsonError("이미 처리됐거나 결제 확인 대상이 아닌 주문입니다.");
      }
      const claimedPayment = await db
        .prepare("UPDATE orders SET payment_status = 'confirming' WHERE id = ? AND payment_status IN ('awaiting_cash','awaiting_kakao') AND point_reservation_status = 'reserved'")
        .bind(orderId)
        .run();
      if (!Number(claimedPayment.meta.changes ?? 0)) return jsonError("다른 관리자가 이미 이 주문을 처리하고 있습니다.", 409);
      const usedCharge = Number(target.used_charge_points || 0);
      const usedReward = Number(target.used_reward_points || 0);
      const usedTotal = usedCharge + usedReward;
      if (Number(target.charge_points || 0) < usedCharge || Number(target.reward_points || 0) < usedReward) {
        await db.prepare("UPDATE orders SET payment_status = ? WHERE id = ? AND payment_status = 'confirming'").bind(String(target.payment_status), orderId).run();
        return jsonError("예약한 리워드 잔액이 부족합니다. 회원 리워드를 확인해 주세요.");
      }
      const nextBalance = Number(target.points || 0) - usedTotal;
      try {
        await db.batch([
          db
            .prepare(
              `UPDATE orders SET payment_status = 'confirmed',
                 point_reservation_status = 'captured', payment_confirmed_at = ?,
                 status = '상품준비' WHERE id = ? AND payment_status = 'confirming'`,
            )
            .bind(now, orderId),
          db
            .prepare(
              `UPDATE members SET points = ?, charge_points = charge_points - ?,
                 reward_points = reward_points - ? WHERE id = ?`,
            )
            .bind(nextBalance, usedCharge, usedReward, Number(target.member_id)),
          ...(usedTotal > 0
            ? [db
                .prepare(
                  `INSERT INTO point_logs
                    (member_id, amount, type, memo, balance_after, created_at, point_bucket)
                   VALUES (?, ?, '사용', ?, ?, ?, 'mixed')`,
                )
                .bind(Number(target.member_id), -usedTotal, `${target.order_no} 혼합결제 확정`, nextBalance, now)]
            : []),
        ]);
      } catch (error) {
        await db
          .prepare("UPDATE orders SET payment_status = ? WHERE id = ? AND payment_status = 'confirming'")
          .bind(String(target.payment_status), orderId)
          .run();
        throw error;
      }
    } else if (action === "order.shipping") {
      const orderId = Number(body.id);
      const courier = String(body.courier ?? "").trim().slice(0, 40);
      const trackingNo = String(body.trackingNo ?? "").trim().slice(0, 80);
      const internationalTrackingNo = String(body.internationalTrackingNo ?? "").trim().slice(0, 100);
      const deliveryStage = String(body.deliveryStage ?? "payment_confirmed");
      const customsStatus = String(body.customsStatus ?? "waiting");
      const status = String(body.status ?? (trackingNo ? "국내배송중" : internationalTrackingNo ? "해외배송중" : "상품준비"));
      if (!["접수", "상품준비", "해외배송중", "통관중", "국내배송중", "배송완료"].includes(status)) {
        return jsonError("배송 상태를 확인해 주세요.");
      }
      if (trackingNo && !courier) {
        return jsonError("운송장 번호와 함께 택배사를 입력해 주세요.");
      }
      const payment = await db
        .prepare("SELECT payment_status FROM orders WHERE id = ?")
        .bind(orderId)
        .first<{ payment_status: string }>();
      if (["awaiting_cash", "awaiting_kakao"].includes(String(payment?.payment_status))) {
        return jsonError("입금 확인 후 배송을 진행해 주세요.");
      }
      await db
        .prepare(
          `UPDATE orders
           SET courier = ?, tracking_no = ?, international_tracking_no = ?,
             delivery_stage = ?, customs_status = ?, status = ?,
             shipped_at = CASE WHEN ? != '' OR ? != '' THEN COALESCE(shipped_at, ?) ELSE NULL END,
             delivered_at = CASE WHEN ? = '배송완료' THEN COALESCE(delivered_at, ?) ELSE delivered_at END
           WHERE id = ? AND status NOT IN ('취소', '반품완료')`,
        )
        .bind(courier, trackingNo, internationalTrackingNo, deliveryStage, customsStatus, status, trackingNo, internationalTrackingNo, now, status, now, orderId)
        .run();
      if (status === "배송완료") {
        await creditPurchaseReward(db, orderId);
        await scheduleFirstPurchaseRewards(orderId);
      }
    } else if (action === "order.status") {
      const allowed = ["결제확인대기", "취소요청", "접수", "상품준비", "해외배송중", "통관중", "국내배송중", "배송완료", "반품요청", "취소", "반품완료"];
      const status = String(body.status ?? "");
      if (!allowed.includes(status)) return jsonError("올바른 주문 상태가 아닙니다.");
      const orderId = Number(body.id);
      const target = await db
        .prepare(
          `SELECT o.*, m.points, m.charge_points, m.reward_points
           FROM orders o JOIN members m ON m.id = o.member_id
           WHERE o.id = ?`,
        )
        .bind(orderId)
        .first<{
          id: number;
          order_no: string;
          member_id: number;
          total_points: number;
          status: string;
          points: number;
          charge_points: number;
          reward_points: number;
          used_charge_points: number;
          used_reward_points: number;
          payment_status: string;
          point_reservation_status: string;
          cash_amount: number;
          purchase_reward_points: number;
          purchase_reward_status: string;
          coupon_id: number | null;
        }>();
      if (!target) return jsonError("주문을 찾을 수 없습니다.");
      if (["awaiting_cash", "awaiting_kakao"].includes(String(target.payment_status)) && !["결제확인대기", "취소"].includes(status)) {
        return jsonError("입금 확인을 먼저 처리해 주세요.");
      }
      const terminalStatuses = ["취소", "반품완료"];
      if (terminalStatuses.includes(target.status) && status !== target.status) {
        return jsonError("취소·반품과 리워드 환급이 완료된 주문은 되돌릴 수 없습니다.");
      }
      if (terminalStatuses.includes(status) && !terminalStatuses.includes(target.status)) {
        await revokeReferralOrderRewards(
          orderId,
          `${target.order_no} 주문 ${status}으로 추천보상 취소·회수`,
        );
        const items = await db
          .prepare("SELECT product_id, quantity, selected_options FROM order_items WHERE order_id = ?")
          .bind(orderId)
          .all<{ product_id: number; quantity: number; selected_options: string }>();
        const restoredVariantStatements = [];
        for (const item of items.results) {
          const product = await db.prepare("SELECT variants_json FROM products WHERE id = ?").bind(item.product_id).first<{ variants_json: string }>();
          let selected: Record<string, string> = {};
          try { selected = JSON.parse(item.selected_options || "{}"); } catch { selected = {}; }
          const variants = parseVariants(product?.variants_json);
          if (variants.length && Object.keys(selected).length) {
            const updated = variants.map((variant) => Object.entries(selected).every(([name, value]) => String(variant.options?.[name]) === String(value)) ? { ...variant, stock: Number(variant.stock || 0) + item.quantity } : variant);
            restoredVariantStatements.push(db.prepare("UPDATE products SET variants_json = ? WHERE id = ?").bind(JSON.stringify(updated), item.product_id));
          }
        }
        const rewarded = await db
          .prepare(
            `SELECT COALESCE(SUM(reward_points), 0) AS points
             FROM reviews
             WHERE order_id = ? AND reward_status = '지급'`,
          )
          .bind(orderId)
          .first<{ points: number }>();
        const rewardRecovery = Number(rewarded?.points ?? 0);
        const purchaseRewardRecovery = target.purchase_reward_status === "credited"
          ? Math.min(
              Number(target.purchase_reward_points || 0),
              Math.max(0, Number(target.reward_points) + Number(target.used_reward_points || 0) - rewardRecovery),
            )
          : 0;
        const reservationOnly = target.point_reservation_status === "reserved";
        const refundedPoints = reservationOnly
          ? 0
          : Number(target.used_charge_points || 0) + Number(target.used_reward_points || 0);
        const refundBalance = target.points + refundedPoints;
        const nextBalance = refundBalance - rewardRecovery - purchaseRewardRecovery;
        const reviewRecoveryFromReward = Math.min(
          rewardRecovery,
          Number(target.reward_points) + Number(target.used_reward_points || 0),
        );
        await db.batch([
          db.prepare("UPDATE orders SET status = ?, payment_status = ?, point_reservation_status = ?, purchase_reward_status = CASE WHEN purchase_reward_status = 'credited' THEN 'revoked' ELSE purchase_reward_status END WHERE id = ?").bind(status, status === "반품완료" ? "refunded" : "canceled", reservationOnly ? "released" : "captured_refunded", orderId),
          db.prepare(`UPDATE members SET points = ?, charge_points = charge_points + ?, reward_points = MAX(0, reward_points + ? - ? - ?) WHERE id = ?`).bind(nextBalance, reservationOnly ? 0 : Number(target.used_charge_points || 0), reservationOnly ? 0 : Number(target.used_reward_points || 0), reviewRecoveryFromReward, purchaseRewardRecovery, target.member_id),
          db
            .prepare(
              `UPDATE reviews
               SET visible = 0, reward_status = '회수', revoked_at = ?,
                   hidden_reason = ?, updated_at = ?
               WHERE order_id = ? AND reward_status = '지급'`,
            )
            .bind(now, `${status} 처리로 구매후기 적립 회수`, now, orderId),
          ...items.results.map((item) =>
            db
              .prepare(
                "UPDATE products SET stock = stock + ?, sales_count = MAX(0, sales_count - ?) WHERE id = ?",
              )
              .bind(item.quantity, item.quantity, item.product_id),
          ),
          ...restoredVariantStatements,
          ...(target.coupon_id ? [db.prepare("UPDATE coupons SET status = '보관', used_by = NULL, used_at = NULL WHERE id = ? AND coupon_type = 'discount'").bind(target.coupon_id)] : []),
          ...(refundedPoints > 0
            ? [db
                .prepare(
                  `INSERT INTO point_logs
                    (member_id, amount, type, memo, balance_after, created_at, point_bucket)
                   VALUES (?, ?, '환급', ?, ?, ?, 'mixed')`,
                )
                .bind(
                  target.member_id,
                  refundedPoints,
                  `${target.order_no} 주문 ${status} 포인트 복원`,
                  refundBalance,
                  now,
                )]
            : []),
          ...(rewardRecovery > 0
            ? [
                db
                  .prepare(
                    `INSERT INTO point_logs
                      (member_id, amount, type, memo, balance_after, created_at)
                     VALUES (?, ?, '후기회수', ?, ?, ?)`,
                  )
                  .bind(
                    target.member_id,
                    -rewardRecovery,
                    `${target.order_no} ${status}으로 상품후기 적립 회수`,
                    nextBalance,
                    now,
                  ),
              ]
            : []),
          ...(purchaseRewardRecovery > 0
            ? [db
                .prepare(
                  `INSERT INTO point_logs
                    (member_id, amount, type, memo, balance_after, created_at, point_bucket)
                   VALUES (?, ?, '구매적립회수', ?, ?, ?, 'reward')`,
                )
                .bind(
                  target.member_id,
                  -purchaseRewardRecovery,
                  `${target.order_no} ${status}으로 구매 적립 회수`,
                  nextBalance,
                  now,
                )]
            : []),
        ]);
      } else {
        await db
          .prepare(
            `UPDATE orders
             SET status = ?,
                 delivered_at = CASE WHEN ? = '배송완료' THEN COALESCE(delivered_at, ?) ELSE delivered_at END
             WHERE id = ?`,
          )
          .bind(status, status, now, orderId)
          .run();
        if (status === "배송완료") {
          await creditPurchaseReward(db, orderId);
          await scheduleFirstPurchaseRewards(orderId);
        }
      }
    } else if (action === "review.visible") {
      await db
        .prepare(
          `UPDATE reviews
           SET visible = ?, hidden_reason = ?, updated_at = ?
           WHERE id = ? AND deleted_at IS NULL`,
        )
        .bind(
          body.visible ? 1 : 0,
          body.visible ? "" : String(body.hiddenReason ?? "관리자 숨김").trim(),
          now,
          Number(body.id),
        )
        .run();
    } else if (action === "review.reply") {
      const reply = String(body.adminReply ?? "").trim().slice(0, 1000);
      await db
        .prepare(
          `UPDATE reviews
           SET admin_reply = ?, answered_at = ?, updated_at = ?
           WHERE id = ? AND deleted_at IS NULL`,
        )
        .bind(reply, reply ? now : null, now, Number(body.id))
        .run();
    } else if (action === "review.delete") {
      const review = await db
        .prepare(
          `SELECT r.*, m.points, m.reward_points AS member_reward_points
           FROM reviews r JOIN members m ON m.id = r.member_id
           WHERE r.id = ?`,
        )
        .bind(Number(body.id))
        .first<{
          id: number;
          member_id: number;
          product_id: number;
          product_name?: string;
          reward_points: number;
          reward_status: string;
          points: number;
          member_reward_points: number;
          deleted_at: string | null;
        }>();
      if (!review || review.deleted_at) return jsonError("후기를 찾을 수 없습니다.", 404);
      const recovery = review.reward_status === "지급"
        ? Math.min(Number(review.reward_points ?? 0), Number(review.member_reward_points ?? 0))
        : 0;
      const nextBalance = Number(review.points) - recovery;
      await db.batch([
        db
          .prepare(
            `UPDATE reviews
             SET visible = 0, deleted_at = ?, updated_at = ?,
                 reward_status = CASE WHEN reward_status = '지급' THEN '회수' ELSE reward_status END,
                 revoked_at = CASE WHEN reward_status = '지급' THEN ? ELSE revoked_at END,
                 hidden_reason = ?
             WHERE id = ?`,
          )
          .bind(now, now, now, String(body.reason ?? "관리자 삭제").trim(), review.id),
        ...(recovery > 0
          ? [
              db
                .prepare("UPDATE members SET points = ?, reward_points = MAX(0, reward_points - ?) WHERE id = ?")
                .bind(nextBalance, recovery, review.member_id),
              db
                .prepare(
                  `INSERT INTO point_logs
                    (member_id, amount, type, memo, balance_after, created_at, point_bucket)
                   VALUES (?, ?, '후기회수', ?, ?, ?, 'reward')`,
                )
                .bind(
                  review.member_id,
                  -recovery,
                  "관리자 후기 삭제로 적립 포인트 회수",
                  nextBalance,
                  now,
                ),
            ]
          : []),
      ]);
    } else if (action === "popup.save") {
      const id = Number(body.id ?? 0);
      const title = String(body.title ?? "").trim();
      const content = String(body.content ?? "").trim();
      if (!title || !content) return jsonError("팝업 제목과 내용을 입력해 주세요.");
      const popupLinkUrl = String(body.linkUrl ?? "/").trim() || "/";
      const popupTarget =
        popupLinkUrl.startsWith("/") || popupLinkUrl.startsWith("#")
          ? "_self"
          : body.target === "_blank"
            ? "_blank"
            : "_self";
      const values = [
        title,
        content,
        String(body.buttonText ?? "확인").trim(),
        popupLinkUrl,
        String(body.backgroundColor ?? "#11243e"),
        String(body.imageUrl ?? "").trim(),
        Math.min(1200, Math.max(280, Number(body.width ?? 420))),
        Math.min(900, Math.max(240, Number(body.height ?? 460))),
        Math.min(100, Math.max(0, Number(body.positionX ?? 50))),
        Math.min(100, Math.max(0, Number(body.positionY ?? 50))),
        popupTarget,
        body.active ? 1 : 0,
        String(body.startsAt ?? now),
        String(body.endsAt ?? "2035-12-31T23:59:59.000Z"),
      ];
      if (id) {
        await db
          .prepare(
            `UPDATE popups SET
              title = ?, content = ?, button_text = ?, link_url = ?,
              background_color = ?, image_url = ?, width = ?, height = ?,
              position_x = ?, position_y = ?, target = ?,
              active = ?, starts_at = ?, ends_at = ?
             WHERE id = ?`,
          )
          .bind(...values, id)
          .run();
      } else {
        await db
          .prepare(
            `INSERT INTO popups
              (title, content, button_text, link_url, background_color, image_url,
               width, height, position_x, position_y, target, active, starts_at, ends_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(...values)
          .run();
      }
    } else if (action === "popup.active") {
      await db
        .prepare("UPDATE popups SET active = ? WHERE id = ?")
        .bind(body.active ? 1 : 0, Number(body.id))
        .run();
    } else if (action === "popup.delete") {
      await db.prepare("DELETE FROM popups WHERE id = ?").bind(Number(body.id)).run();
    } else if (action === "notice.save") {
      const id = Number(body.id ?? 0);
      const title = String(body.title ?? "").trim();
      const content = String(body.content ?? "").trim();
      if (!title || !content) return jsonError("공지 제목과 내용을 입력해 주세요.");
      if (id) {
        await db
          .prepare("UPDATE notices SET title = ?, content = ?, active = ? WHERE id = ?")
          .bind(title, content, body.active ? 1 : 0, id)
          .run();
      } else {
        await db
          .prepare(
            "INSERT INTO notices (title, content, active, created_at) VALUES (?, ?, ?, ?)",
          )
          .bind(title, content, body.active ? 1 : 0, now)
          .run();
      }
    } else if (action === "notice.active") {
      await db
        .prepare("UPDATE notices SET active = ? WHERE id = ?")
        .bind(body.active ? 1 : 0, Number(body.id))
        .run();
    } else if (action === "notice.delete") {
      await db.prepare("DELETE FROM notices WHERE id = ?").bind(Number(body.id)).run();
    } else if (action === "coupon.generate") {
      const count = Math.min(100, Math.max(1, Number(body.count ?? 1)));
      const couponType = body.couponType === "discount" ? "discount" : "point";
      const pointAmount = couponType === "point" ? Math.max(1, Number(body.pointAmount ?? 0)) : 0;
      const discountKind = body.discountKind === "percent" ? "percent" : "fixed";
      const discountValue = couponType === "discount" ? Math.max(1, Math.min(discountKind === "percent" ? 100 : 100000000, Number(body.discountValue ?? 0))) : 0;
      const minimumOrder = Math.max(0, Math.min(100000000, Number(body.minimumOrder ?? 0)));
      const targetCategory = String(body.targetCategory ?? "전체").trim().slice(0, 30) || "전체";
      const name = String(body.name ?? "리워드 쿠폰").trim();
      if (couponType === "discount" && !discountValue) return jsonError("할인 값을 입력해 주세요.");
      const expiresAt = body.expiresAt ? String(body.expiresAt) : null;
      await db.batch(
        Array.from({ length: count }, () => {
          const code = `PG-${crypto.randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`;
          return db
            .prepare(
              `INSERT INTO coupons
                (code, name, point_amount, coupon_type, discount_kind, discount_value,
                 minimum_order, target_category, status, used_by, used_at, expires_at, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, '미사용', NULL, NULL, ?, ?)`,
            )
            .bind(code, name, pointAmount, couponType, discountKind, discountValue, minimumOrder, targetCategory, expiresAt, now);
        }),
      );
    } else if (action === "coupon.status") {
      const status = body.status === "중지" ? "중지" : "미사용";
      await db
        .prepare("UPDATE coupons SET status = ? WHERE id = ? AND status != '사용'")
        .bind(status, Number(body.id))
        .run();
    } else if (action === "inquiry.answer") {
      const answer = String(body.answer ?? "").trim();
      if (!answer) return jsonError("답변 내용을 입력해 주세요.");
      await db
        .prepare(
          "UPDATE inquiries SET answer = ?, status = '답변완료', answered_at = ? WHERE id = ?",
        )
        .bind(answer, now, Number(body.id))
        .run();
    } else if (action === "inquiry.delete") {
      await db.prepare("DELETE FROM inquiries WHERE id = ?").bind(Number(body.id)).run();
    }

    await db
      .prepare(
        "INSERT INTO audit_logs (admin_name, action, target, created_at) VALUES (?, ?, ?, ?)",
      )
      .bind(
        String(admin.name ?? admin.username ?? "관리자"),
        action,
        String(body.id ?? body.memberId ?? body.username ?? (Array.isArray(body.ids) ? body.ids.join(",") : "")),
        now,
      )
      .run();
    if (action === "live.quickProduct" || action === "live.resetHistory") {
      return Response.json({ liveRefresh: true, ...(actionMessage ? { actionMessage } : {}) });
    }
    return Response.json({ scope: permission, ...(await getAdminPayload(admin, permission)), ...(actionMessage ? { actionMessage } : {}) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "관리 요청 처리에 실패했습니다.";
    if (message.includes("admin_accounts.username")) {
      return jsonError("이미 사용 중인 관리자 아이디입니다.");
    }
    if (message.includes("UNIQUE")) return jsonError("이미 등록된 이메일입니다.");
    return jsonError(message, 500);
  }
}
