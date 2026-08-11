import {
  getD1,
  jsonError,
  makeOrderNo,
  nowIso,
} from "../../../lib/server";
import {
  ensureSeedData,
  getPublicCatalog,
  requireAdmin,
} from "../../../lib/data";
import { PRODUCT_LIST_COLUMNS, PRODUCT_REVIEW_JOIN } from "../../../lib/catalog-query";
import {
  getNativeMemberSessionFromHeaders,
  renewMemberSessionIfNeeded,
  type NativeMemberSession,
} from "../../../lib/member-auth";
import { ADMIN_SESSION_COOKIE } from "../../../lib/admin-auth";
import { getRewardCenter } from "../../../lib/rewards";
import { kakaoPaymentUrl, processExpiredPaymentReservations } from "../../../lib/payments";
import { encryptPersonalValue, maskCustomsCode, normalizeCustomsCode, validCustomsCode } from "../../../lib/personal-data";

export const dynamic = "force-dynamic";

type ActionPayload = {
  action?: string;
  channelId?: number;
  productId?: number;
  cartId?: number;
  cartIds?: number[];
  addressId?: number;
  shippingAddressId?: number;
  orderId?: number;
  quantity?: number;
  selectedOptions?: Record<string, string>;
  label?: string;
  recipient?: string;
  phone?: string;
  address?: string;
  postalCode?: string;
  address1?: string;
  addressDetail?: string;
  deliveryRequest?: string;
  isDefault?: boolean;
  saveAddress?: boolean;
  memo?: string;
  requestType?: string;
  amount?: number;
  usedPoints?: number;
  cashPaymentChannel?: string;
  orderItemId?: number;
  bankName?: string;
  accountNo?: string;
  accountHolder?: string;
  rating?: number;
  title?: string;
  content?: string;
  imageUrls?: string[];
  code?: string;
  couponId?: number;
  category?: string;
  name?: string;
  slug?: string;
  description?: string;
  operatorName?: string;
  youtubeUrl?: string;
  applicationMessage?: string;
  broadcastTitle?: string;
  broadcastNotice?: string;
  productIds?: number[];
  categorySettings?: Array<{ label?: string; productIds?: number[] }>;
  categories?: Array<{ label?: string; productIds?: number[] }>;
  replays?: Array<{ id?: string; title?: string; youtubeUrl?: string; date?: string; orientation?: string; completed?: boolean }>;
  shorts?: Array<{ id?: string; title?: string; youtubeUrl?: string; productId?: number; visible?: boolean }>;
  contactSettings?: Record<string, unknown>;
  idempotencyKey?: string;
  customsCode?: string;
  customsNameConfirmed?: boolean;
  saveCustomsCode?: boolean;
  claimType?: string;
  reasonType?: string;
  reasonDetail?: string;
};

type ProductOption = { name: string; values: string[] };
type ProductVariant = { key: string; options: Record<string, string>; sku: string; stock: number; additionalPrice: number; active: boolean };
type ShippingInput = {
  label: string;
  recipient: string;
  phone: string;
  postalCode: string;
  address1: string;
  addressDetail: string;
  deliveryRequest: string;
  isDefault: boolean;
  customsCode: string;
  customsNameConfirmed: boolean;
  saveCustomsCode: boolean;
};

function normalizeShippingInput(payload: ActionPayload): ShippingInput {
  return {
    label: String(payload.label ?? "배송지").trim().slice(0, 20) || "배송지",
    recipient: String(payload.recipient ?? "").trim().slice(0, 40),
    phone: String(payload.phone ?? "").trim().slice(0, 30),
    postalCode: String(payload.postalCode ?? "").trim().slice(0, 10),
    address1: String(payload.address1 ?? payload.address ?? "").trim().slice(0, 180),
    addressDetail: String(payload.addressDetail ?? "").trim().slice(0, 120),
    deliveryRequest: String(payload.deliveryRequest ?? payload.memo ?? "")
      .trim()
      .slice(0, 120),
    isDefault: Boolean(payload.isDefault),
    customsCode: normalizeCustomsCode(payload.customsCode),
    customsNameConfirmed: Boolean(payload.customsNameConfirmed),
    saveCustomsCode: Boolean(payload.saveCustomsCode),
  };
}

function shippingInputError(input: ShippingInput) {
  if (input.recipient.length < 2) return "받는 분을 두 글자 이상 입력해 주세요.";
  if (input.phone.replace(/\D/g, "").length < 8) {
    return "연락 가능한 전화번호를 입력해 주세요.";
  }
  if (input.address1.length < 5) return "배송지 주소를 확인해 주세요.";
  return "";
}

function combinedAddress(input: Pick<ShippingInput, "postalCode" | "address1" | "addressDetail">) {
  return [
    input.postalCode ? `[${input.postalCode}]` : "",
    input.address1,
    input.addressDetail,
  ]
    .filter(Boolean)
    .join(" ");
}

function customsExpiry(now = new Date()) {
  const expiry = new Date(now);
  expiry.setFullYear(expiry.getFullYear() + 1);
  return expiry.toISOString();
}

function parseProductOptions(value: unknown): ProductOption[] {
  try {
    const parsed = JSON.parse(String(value ?? "[]"));
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => ({
        name: String(item?.name ?? "").trim(),
        values: Array.isArray(item?.values)
          ? item.values.map(String).map((entry: string) => entry.trim()).filter(Boolean)
          : [],
      }))
      .filter((item) => item.name && item.values.length);
  } catch {
    return [];
  }
}

function selectedOptionsJson(
  definitions: ProductOption[],
  selected: Record<string, string> | undefined,
) {
  if (!definitions.length) return "{}";
  const normalized: Record<string, string> = {};
  for (const option of definitions) {
    const value = String(selected?.[option.name] ?? "").trim();
    if (!option.values.includes(value)) return null;
    normalized[option.name] = value;
  }
  return JSON.stringify(normalized);
}

function parseVariants(value: unknown): ProductVariant[] {
  try {
    const parsed = JSON.parse(String(value ?? "[]"));
    return Array.isArray(parsed) ? parsed.filter((entry) => entry && typeof entry === "object") : [];
  } catch { return []; }
}

function matchingVariant(value: unknown, selectedOptions: string) {
  let selected: Record<string, string> = {};
  try { selected = JSON.parse(selectedOptions || "{}"); } catch { selected = {}; }
  return parseVariants(value).find((variant) => Object.keys(selected).length > 0 && Object.entries(selected).every(([name, option]) => String(variant.options?.[name]) === String(option)));
}

function parseJsonArray<T>(value: unknown): T[] {
  try { const parsed = JSON.parse(String(value ?? "[]")); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
}

function seoulDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function previousSeoulDateKey() {
  return seoulDateKey(new Date(Date.now() - 24 * 60 * 60 * 1000));
}

function fmtAttendancePoints(value: number) {
  return value.toLocaleString("ko-KR");
}

export async function getStorePayload(
  member: Record<string, unknown>,
  memberAuthType: "native" | "guest" = "native",
  siteUrl = "",
  options: { skipCatalog?: boolean } = {},
) {
  const db = getD1();
  const memberId = Number(member.id);
  const reserved = memberId
    ? await db
        .prepare(
          `SELECT COALESCE(SUM(used_charge_points), 0) AS charge,
                  COALESCE(SUM(used_reward_points), 0) AS reward
           FROM orders
           WHERE member_id = ? AND point_reservation_status = 'reserved'`,
        )
        .bind(memberId)
        .first<{ charge: number; reward: number }>()
    : { charge: 0, reward: 0 };
  const [
    settingsRows,
    products,
    salesChannels,
    cart,
    addresses,
    reviewItems,
    wishlist,
    orders,
    pointLogs,
    pointSummary,
    attendanceRows,
    finance,
    reviews,
    popups,
    notices,
    inquiries,
  ] =
    await Promise.all([
      db.prepare("SELECT key, value FROM settings").all(),
      options.skipCatalog
        ? Promise.resolve({ results: [] })
        : db
        .prepare(
          `SELECT ${PRODUCT_LIST_COLUMNS}
           FROM products p
           LEFT JOIN product_catalog_details d ON d.product_id = p.id
           ${PRODUCT_REVIEW_JOIN}
           WHERE p.status = 'active' ORDER BY p.id DESC`,
        )
        .all(),
      options.skipCatalog
        ? Promise.resolve({ results: [] })
        : db
        .prepare(
          `SELECT c.*,
             (SELECT GROUP_CONCAT(cp.product_id) FROM sales_channel_products cp WHERE cp.channel_id = c.id) AS product_ids
           FROM sales_channels c
           WHERE c.status = 'active'
           ORDER BY c.sort_order, c.id`,
        )
        .all(),
      db
        .prepare(
          `SELECT c.id, c.quantity, c.selected_options, c.channel_id, c.channel_name,
                  p.id AS product_id, p.name, p.image_url, p.point_price, p.stock, p.status, p.category, p.variants_json,
                  p.point_usage_mode, p.point_max_percent, p.cash_payment_enabled
           FROM carts c JOIN products p ON p.id = c.product_id
           WHERE c.member_id = ? ORDER BY c.id DESC`,
        )
        .bind(memberId)
        .all(),
      memberId
        ? db
            .prepare(
              `SELECT * FROM shipping_addresses
               WHERE member_id = ?
               ORDER BY is_default DESC,
                        CASE WHEN last_used_at IS NULL THEN 1 ELSE 0 END,
                        last_used_at DESC,
                        updated_at DESC,
                        id DESC`,
            )
            .bind(memberId)
            .all()
        : Promise.resolve({ results: [] }),
      db
        .prepare(
          `SELECT
             oi.id AS order_item_id, oi.order_id, oi.product_id, oi.product_name,
             oi.selected_options, oi.quantity, oi.point_price,
             p.image_url, p.brand, p.category,
             o.order_no, o.status AS order_status, o.delivered_at, o.created_at AS ordered_at,
             r.id AS review_id, r.reward_points, r.reward_status, r.visible AS review_visible,
             r.deleted_at
           FROM order_items oi
           JOIN orders o ON o.id = oi.order_id
           LEFT JOIN products p ON p.id = oi.product_id
           LEFT JOIN reviews r ON r.order_item_id = oi.id
           WHERE o.member_id = ?
           ORDER BY o.id DESC, oi.id ASC`,
        )
        .bind(memberId)
        .all(),
      db
        .prepare("SELECT product_id FROM wishlists WHERE member_id = ?")
        .bind(memberId)
        .all(),
      db
        .prepare(
          `SELECT o.*,
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
           FROM orders o WHERE o.member_id = ? ORDER BY o.id DESC LIMIT 30`,
        )
        .bind(memberId)
        .all(),
      db
        .prepare(
          "SELECT * FROM point_logs WHERE member_id = ? ORDER BY id DESC LIMIT 100",
        )
        .bind(memberId)
        .all(),
      db
        .prepare(
          `SELECT
             COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) AS earned,
             COALESCE(ABS(SUM(CASE WHEN amount < 0 THEN amount ELSE 0 END)), 0) AS used,
             COUNT(*) AS count
           FROM point_logs WHERE member_id = ?`,
        )
        .bind(memberId)
        .first(),
      memberId
        ? db
            .prepare(
              `SELECT * FROM attendance_records
               WHERE member_id = ? ORDER BY attendance_date DESC LIMIT 31`,
            )
            .bind(memberId)
            .all()
        : Promise.resolve({ results: [] }),
      db
        .prepare(
          "SELECT * FROM finance_requests WHERE member_id = ? ORDER BY id DESC LIMIT 30",
        )
        .bind(memberId)
        .all(),
      db
        .prepare(
          `SELECT r.*, p.name AS product_name, m.name AS member_name
           FROM reviews r
           JOIN products p ON p.id = r.product_id
           JOIN members m ON m.id = r.member_id
           WHERE (r.visible = 1 AND r.deleted_at IS NULL) OR r.member_id = ?
           ORDER BY r.id DESC LIMIT 30`,
        )
        .bind(memberId)
        .all(),
      db
        .prepare(
          `SELECT * FROM popups
           WHERE active = 1 AND starts_at <= ? AND ends_at >= ?
           ORDER BY id DESC LIMIT 1`,
        )
        .bind(nowIso(), nowIso())
        .all(),
      db
        .prepare("SELECT * FROM notices WHERE active = 1 ORDER BY id DESC LIMIT 5")
        .all(),
      memberId
        ? db
            .prepare(
              "SELECT * FROM inquiries WHERE member_id = ? ORDER BY id DESC LIMIT 30",
            )
            .bind(memberId)
            .all()
        : Promise.resolve({ results: [] }),
    ]);

  const settings = Object.fromEntries(
    settingsRows.results
      .filter((row) => String(row.key) !== "signup_code")
      .map((row) => [String(row.key), String(row.value)]),
  );
  const memberChannel = memberId ? await db.prepare(
    `SELECT id, slug, name, operator_name, description, image_url, avatar_image_url,
            youtube_url, broadcast_settings, category_settings, contact_settings,
            theme_color, status, application_status, application_message,
            admin_review_note, applied_at, approved_at, publication_requested_at, published_at,
            (SELECT GROUP_CONCAT(cp.product_id) FROM sales_channel_products cp WHERE cp.channel_id = sales_channels.id) AS product_ids,
            (SELECT COUNT(*) FROM sales_channel_products cp WHERE cp.channel_id = sales_channels.id) AS product_count
       FROM sales_channels WHERE owner_member_id = ? LIMIT 1`,
  ).bind(memberId).first<Record<string, unknown>>() : null;
  const claimedCoupons = memberId && settings.feature_discount_enabled === "true"
    ? await db.prepare(`SELECT * FROM coupons WHERE claimed_by = ? AND status = '보관' AND coupon_type = 'discount' ORDER BY expires_at IS NULL DESC, expires_at`).bind(memberId).all()
    : { results: [] };
  const orderClaims = memberId
    ? await db.prepare("SELECT * FROM order_claims WHERE member_id = ? ORDER BY id DESC LIMIT 30").bind(memberId).all()
    : { results: [] };
  const memberSpend = memberId ? await db.prepare(`SELECT COALESCE(SUM(total_points), 0) AS total FROM orders WHERE member_id = ? AND status NOT IN ('취소', '반품완료')`).bind(memberId).first<{ total: number }>() : { total: 0 };
  const tiers = parseJsonArray<{ id: string; name: string; minSpend: number; rewardRate: number }>(settings.member_tiers).sort((a, b) => Number(a.minSpend) - Number(b.minSpend));
  const memberTier = settings.feature_member_tiers_enabled === "true" ? tiers.filter((tier) => Number(memberSpend?.total || 0) >= Number(tier.minSpend || 0)).at(-1) || tiers[0] || null : null;
  const cartRows = cart.results.map((row) => {
    const variant = settings.feature_variant_stock_enabled === "true" ? matchingVariant(row.variants_json, String(row.selected_options)) : null;
    return { ...row, point_price: Number(row.point_price) + Number(variant?.additionalPrice || 0), stock: variant ? Number(variant.stock) : Number(row.stock), variant_sku: variant?.sku || "" };
  });
  const reviewWriteDays = Math.max(1, Number(settings.review_write_days || 90));
  const attendanceHistory = attendanceRows.results;
  const attendanceDailyPoints = Math.max(
    0,
    Number(settings.attendance_daily_points || 100),
  );
  const attendanceStreakDays = Math.max(
    2,
    Number(settings.attendance_streak_days || 7),
  );
  const attendanceStreakBonus = Math.max(
    0,
    Number(settings.attendance_streak_bonus || 500),
  );
  const attendanceToday = attendanceHistory.find(
    (row) => String(row.attendance_date) === seoulDateKey(),
  );
  const latestAttendance = attendanceHistory[0];
  const activeAttendanceStreak = attendanceToday
    ? Number(attendanceToday.streak ?? 0)
    : String(latestAttendance?.attendance_date ?? "") === previousSeoulDateKey()
      ? Number(latestAttendance?.streak ?? 0)
      : 0;
  const nowTime = Date.now();
  const reviewableItems = reviewItems.results.map((row) => {
    const completedAt = String(row.delivered_at || row.ordered_at || "");
    const deadline = new Date(completedAt);
    deadline.setDate(deadline.getDate() + reviewWriteDays);
    const orderCompleted = ["배송완료", "완료"].includes(String(row.order_status));
    return {
      ...row,
      review_deadline: deadline.toISOString(),
      review_eligible:
        orderCompleted &&
        !row.review_id &&
        !row.deleted_at &&
        deadline.getTime() >= nowTime,
      review_expired: orderCompleted && !row.review_id && deadline.getTime() < nowTime,
    };
  });

  const memberWithAvailablePoints = {
    ...member,
    reserved_charge_points: Number(reserved?.charge ?? 0),
    reserved_reward_points: Number(reserved?.reward ?? 0),
    available_charge_points: Math.max(0, Number(member.charge_points ?? 0) - Number(reserved?.charge ?? 0)),
    available_reward_points: Math.max(0, Number(member.reward_points ?? 0) - Number(reserved?.reward ?? 0)),
    available_points: Math.max(0, Number(member.points ?? 0) - Number(reserved?.charge ?? 0) - Number(reserved?.reward ?? 0)),
  };
  const ordersWithPaymentLinks = orders.results.map((order) => {
    const { customs_code_encrypted: _encrypted, ...safeOrder } = order as Record<string, unknown>;
    return ({
    ...safeOrder,
    kakao_payment_url:
      ["awaiting_cash", "awaiting_kakao"].includes(String(order.payment_status)) &&
      String(order.cash_payment_channel || "kakao_transfer") === "kakao_transfer"
        ? kakaoPaymentUrl(String(settings.kakao_payment_url || ""), {
            orderNo: String(order.order_no),
            items: String(order.items || "상품 주문"),
            cashAmount: Number(order.cash_amount || 0),
          })
        : "",
  })});
  const safeAddresses = addresses.results.map((address) => {
    const { customs_code_encrypted: _encrypted, ...safeAddress } = address as Record<string, unknown>;
    return safeAddress;
  });
  return {
    settings,
    products: products.results,
    salesChannels: salesChannels.results,
    memberChannel,
    cart: cartRows,
    addresses: safeAddresses,
    wishlist: wishlist.results.map((row) => Number(row.product_id)),
    orders: ordersWithPaymentLinks,
    orderClaims: orderClaims.results,
    reviewableItems,
    pointLogs: pointLogs.results,
    pointSummary: {
      earned: Number(pointSummary?.earned ?? 0),
      used: Number(pointSummary?.used ?? 0),
      count: Number(pointSummary?.count ?? 0),
    },
    attendance: {
      enabled: settings.attendance_enabled !== "false",
      todayChecked: Boolean(attendanceToday),
      today: attendanceToday ?? null,
      streak: activeAttendanceStreak,
      dailyPoints: attendanceDailyPoints,
      streakDays: attendanceStreakDays,
      streakBonus: attendanceStreakBonus,
      history: attendanceHistory,
    },
    finance: finance.results,
    reviews: reviews.results,
    popups: popups.results,
    notices: notices.results,
    inquiries: inquiries.results,
    member: memberWithAvailablePoints,
    memberTier: memberTier ? { ...memberTier, totalSpend: Number(memberSpend?.total || 0) } : null,
    discountCoupons: claimedCoupons.results,
    memberAuthType,
    reward: memberId ? await getRewardCenter(memberId, siteUrl) : null,
  };
}

export async function GET(request: Request) {
  try {
    const nativeSession = await getNativeMemberSessionFromHeaders(
      request.headers,
    );
    const url = new URL(request.url);
    if (url.searchParams.get("scope") === "live-assistant") {
      if (!nativeSession) return jsonError("로그인이 필요합니다.", 401);
      const db = getD1();
      const channel = await db.prepare(
        `SELECT * FROM sales_channels
         WHERE owner_member_id = ? AND status IN ('draft', 'active')
         ORDER BY CASE WHEN status = 'active' THEN 0 ELSE 1 END, id DESC LIMIT 1`,
      ).bind(Number(nativeSession.member.id)).first<Record<string, unknown>>();
      if (!channel) return jsonError("관리할 내 채널을 찾을 수 없습니다.", 404);
      let broadcast: Record<string, unknown> = {};
      try { broadcast = JSON.parse(String(channel.broadcast_settings || "{}")); } catch { broadcast = {}; }
      const productIds = new Set<number>();
      const collectIds = (value: unknown, key = "") => {
        if (Array.isArray(value)) return value.forEach((item) => collectIds(item, key));
        if (value && typeof value === "object") return Object.entries(value as Record<string, unknown>).forEach(([childKey, child]) => collectIds(child, childKey));
        if (/productids?|product_id/i.test(key)) {
          const id = Number(value);
          if (Number.isInteger(id) && id > 0) productIds.add(id);
        }
      };
      collectIds(broadcast);
      const ids = [...productIds];
      const [settingsRows, productRows] = await Promise.all([
        db.prepare("SELECT key, value FROM settings WHERE key IN ('primary_color', 'secondary_color')").all(),
        ids.length
          ? db.prepare(`SELECT id, name, image_url, point_price, status FROM products WHERE status = 'active' AND id IN (${ids.map(() => "?").join(",")})`).bind(...ids).all()
          : Promise.resolve({ results: [] }),
      ]);
      return storeResponse({
        settings: Object.fromEntries(settingsRows.results.map((row) => [String(row.key), String(row.value)])),
        products: productRows.results,
        salesChannels: [channel],
        memberChannel: channel,
      }, nativeSession, request);
    }
    if (url.searchParams.get("scope") === "channel-catalog") {
      if (!nativeSession) return jsonError("로그인이 필요합니다.", 401);
      const db = getD1();
      const channel = await db.prepare(
        `SELECT id FROM sales_channels
         WHERE owner_member_id = ? AND status IN ('draft', 'active', 'inactive')
         ORDER BY CASE WHEN status = 'active' THEN 0 ELSE 1 END, id DESC LIMIT 1`,
      ).bind(Number(nativeSession.member.id)).first<Record<string, unknown>>();
      if (!channel) return jsonError("관리할 내 채널을 찾을 수 없습니다.", 404);
      const [products, categorySettings] = await Promise.all([
        db.prepare(
          `SELECT p.id, p.name, p.category, p.brand, p.product_code, p.style_number,
                  p.image_url, p.status, d.subcategory, d.product_type
             FROM products p
             LEFT JOIN product_catalog_details d ON d.product_id = p.id
            WHERE p.status = 'active'
            ORDER BY p.id DESC`,
        ).all(),
        db.prepare("SELECT key, value FROM settings WHERE key IN ('product_categories', 'product_category_config')").all(),
      ]);
      return storeResponse({
        partial: "channel-catalog",
        products: products.results,
        settings: Object.fromEntries(categorySettings.results.map((row) => [String(row.key), String(row.value)])),
      }, nativeSession, request);
    }
    // Guest storefront reads must stay read-only. Reservation maintenance is
    // only relevant when an authenticated member requests account data.
    if (nativeSession) await processExpiredPaymentReservations();
    const member = nativeSession?.member ?? {
      id: 0,
      email: "",
      name: "방문자",
      role: "guest",
      status: "guest",
      points: 0,
      phone: "",
    };
    const [memberPayload, publicCatalog] = await Promise.all([
      getStorePayload(
        member,
        nativeSession ? "native" : "guest",
        url.origin,
        { skipCatalog: true },
      ),
      getPublicCatalog(),
    ]);
    const payload = {
      ...publicCatalog,
      ...memberPayload,
      settings: publicCatalog.settings,
      products: publicCatalog.products,
      catalog: publicCatalog.catalog,
      salesChannels: publicCatalog.salesChannels,
    };
    const hasAdminSession = String(request.headers.get("cookie") || "")
      .split(";")
      .some((part) => part.trim().startsWith(`${ADMIN_SESSION_COOKIE}=`));
    const admin = hasAdminSession ? await requireAdmin(request) : null;
    return storeResponse(
      {
        ...payload,
        adminAccess: admin?.isSupervisor
          ? { isSupervisor: true, channelManagementHref: "/admin" }
          : null,
      },
      nativeSession,
      request,
    );
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "데이터를 불러오지 못했습니다.", 500);
  }
}

export async function POST(request: Request) {
  try {
    await ensureSeedData();
    await processExpiredPaymentReservations();
    const nativeSession = await getNativeMemberSessionFromHeaders(
      request.headers,
    );
    const member = nativeSession?.member;
    if (!member || member.status !== "active") {
      return jsonError("회원 로그인이 필요합니다.", 401);
    }
    const memberId = Number(member.id);
    const db = getD1();
    const payload = (await request.json()) as ActionPayload;
    const now = nowIso();

    if (payload.action === "cart.add") {
      const productId = Number(payload.productId);
      const quantity = Math.max(1, Number(payload.quantity ?? 1));
      const product = await db
        .prepare("SELECT id, stock, status, options_json, variants_json FROM products WHERE id = ?")
        .bind(productId)
        .first<{ id: number; stock: number; status: string; options_json: string; variants_json: string }>();
      if (!product || product.status !== "active") return jsonError("주문할 수 없는 상품입니다.");
      if (product.stock < 1) return jsonError("품절된 상품입니다.");
      const selectedOptions = selectedOptionsJson(
        parseProductOptions(product.options_json),
        payload.selectedOptions,
      );
      if (selectedOptions === null) return jsonError("상품 옵션을 모두 선택해 주세요.");
      const variantEnabled = (await db.prepare("SELECT value FROM settings WHERE key = 'feature_variant_stock_enabled'").first<{ value: string }>())?.value === "true";
      const variant = variantEnabled ? matchingVariant(product.variants_json, selectedOptions) : null;
      if (variantEnabled && parseVariants(product.variants_json).length && (!variant || !variant.active || Number(variant.stock) < 1)) return jsonError("선택한 옵션은 품절되었습니다.");
      const availableStock = variant ? Number(variant.stock) : product.stock;
      const requestedChannelId = Math.max(0, Math.floor(Number(payload.channelId ?? 0)));
      const attributedChannel = requestedChannelId
        ? await db.prepare(
            `SELECT c.id, c.name FROM sales_channels c
             JOIN sales_channel_products cp ON cp.channel_id = c.id
             WHERE c.id = ? AND c.status = 'active' AND cp.product_id = ?`,
          ).bind(requestedChannelId, productId).first<{ id: number; name: string }>()
        : null;
      const existing = await db
        .prepare(
          `SELECT id, quantity FROM carts
           WHERE member_id = ? AND product_id = ? AND selected_options = ?`,
        )
        .bind(memberId, productId, selectedOptions)
        .first<{ id: number; quantity: number }>();
      const nextQuantity = Math.min(availableStock, (existing?.quantity ?? 0) + quantity);
      if (existing) {
        await db.prepare(
          `UPDATE carts SET quantity = ?, channel_id = ?, channel_name = ? WHERE id = ?`,
        ).bind(nextQuantity, attributedChannel?.id ?? null, attributedChannel?.name ?? "", existing.id).run();
      } else {
        await db
          .prepare(
            `INSERT INTO carts
              (member_id, product_id, selected_options, quantity, channel_id, channel_name, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(memberId, productId, selectedOptions, nextQuantity, attributedChannel?.id ?? null, attributedChannel?.name ?? "", now)
          .run();
      }
      const cartItem = await db.prepare(
        `SELECT c.id, c.quantity, c.selected_options, c.channel_id, c.channel_name,
                p.id AS product_id, p.name, p.image_url, p.point_price, p.stock, p.status, p.category, p.variants_json,
                p.point_usage_mode, p.point_max_percent, p.cash_payment_enabled
         FROM carts c JOIN products p ON p.id = c.product_id
         WHERE c.member_id = ? AND c.product_id = ? AND c.selected_options = ?
         LIMIT 1`,
      ).bind(memberId, productId, selectedOptions).first<Record<string, unknown>>();
      if (!cartItem) return jsonError("장바구니 정보를 확인하지 못했습니다.", 500);
      return storeResponse({
        partial: "cart.add",
        cartCount: Number((await db.prepare("SELECT COUNT(*) AS count FROM carts WHERE member_id = ?").bind(memberId).first<{ count: number }>())?.count || 0),
        cartItem: {
          ...cartItem,
          point_price: Number(cartItem.point_price) + Number(variant?.additionalPrice || 0),
          stock: variant ? Number(variant.stock) : Number(cartItem.stock),
          variant_sku: variant?.sku || "",
        },
      }, nativeSession, request);
    } else if (payload.action === "cart.update") {
      const quantity = Math.max(0, Number(payload.quantity ?? 1));
      const cartId = Number(payload.cartId ?? 0);
      if (quantity === 0) {
        if (cartId) {
          await db
            .prepare("DELETE FROM carts WHERE member_id = ? AND id = ?")
            .bind(memberId, cartId)
            .run();
        } else {
          await db
            .prepare("DELETE FROM carts WHERE member_id = ? AND product_id = ?")
            .bind(memberId, Number(payload.productId))
            .run();
        }
      } else {
        const targetClause = cartId ? "id = ?" : "product_id = ?";
        await db
          .prepare(
            `UPDATE carts
             SET quantity = MIN(?, (SELECT stock FROM products WHERE id = carts.product_id))
             WHERE member_id = ? AND ${targetClause}`,
          )
          .bind(quantity, memberId, cartId || Number(payload.productId))
          .run();
      }
    } else if (payload.action === "wishlist.toggle") {
      const productId = Number(payload.productId);
      const existing = await db
        .prepare("SELECT id FROM wishlists WHERE member_id = ? AND product_id = ?")
        .bind(memberId, productId)
        .first<{ id: number }>();
      if (existing) {
        await db.prepare("DELETE FROM wishlists WHERE id = ?").bind(existing.id).run();
      } else {
        await db
          .prepare(
            "INSERT INTO wishlists (member_id, product_id, created_at) VALUES (?, ?, ?)",
          )
          .bind(memberId, productId, now)
          .run();
      }
      const wishlist = await db.prepare("SELECT product_id FROM wishlists WHERE member_id = ?").bind(memberId).all();
      return storeResponse({ partial: "wishlist.toggle", wishlist: wishlist.results.map((row) => Number(row.product_id)) }, nativeSession, request);
    } else if (payload.action === "address.save") {
      const input = normalizeShippingInput(payload);
      const validationError = shippingInputError(input);
      if (validationError) return jsonError(validationError);
      if (input.customsCode && (!validCustomsCode(input.customsCode) || !input.customsNameConfirmed)) {
        return jsonError("개인통관고유부호와 수취인 정보 일치 확인을 완료해 주세요.");
      }
      const customsEncrypted = input.customsCode ? await encryptPersonalValue(input.customsCode) : "";
      const customsMasked = input.customsCode ? maskCustomsCode(input.customsCode) : "";
      const customsVerifiedAt = input.customsCode ? now : null;
      const customsExpiresAt = input.customsCode ? customsExpiry() : null;
      const addressId = Number(payload.addressId ?? 0);
      const currentDefault = await db
        .prepare(
          "SELECT id FROM shipping_addresses WHERE member_id = ? AND is_default = 1 LIMIT 1",
        )
        .bind(memberId)
        .first<{ id: number }>();
      const makeDefault = input.isDefault || !currentDefault;
      if (addressId) {
        const existing = await db
          .prepare(
            "SELECT id FROM shipping_addresses WHERE id = ? AND member_id = ?",
          )
          .bind(addressId, memberId)
          .first();
        if (!existing) return jsonError("배송지를 찾을 수 없습니다.", 404);
        const statements = [];
        if (makeDefault) {
          statements.push(
            db
              .prepare(
                "UPDATE shipping_addresses SET is_default = 0 WHERE member_id = ?",
              )
              .bind(memberId),
          );
        }
        statements.push(
          db
            .prepare(
              `UPDATE shipping_addresses
               SET label = ?, recipient = ?, phone = ?, postal_code = ?,
                   address1 = ?, address_detail = ?, delivery_request = ?,
                   is_default = ?,
                   customs_code_encrypted = CASE WHEN ? != '' THEN ? ELSE customs_code_encrypted END,
                   customs_code_masked = CASE WHEN ? != '' THEN ? ELSE customs_code_masked END,
                   customs_verified_at = CASE WHEN ? != '' THEN ? ELSE customs_verified_at END,
                   customs_expires_at = CASE WHEN ? != '' THEN ? ELSE customs_expires_at END,
                   customs_save_consent_at = CASE WHEN ? != '' THEN ? ELSE customs_save_consent_at END,
                   updated_at = ?
               WHERE id = ? AND member_id = ?`,
            )
            .bind(
              input.label,
              input.recipient,
              input.phone,
              input.postalCode,
              input.address1,
              input.addressDetail,
              input.deliveryRequest,
              makeDefault ? 1 : 0,
              customsEncrypted, customsEncrypted,
              customsEncrypted, customsMasked,
              customsEncrypted, customsVerifiedAt,
              customsEncrypted, customsExpiresAt,
              customsEncrypted, input.saveCustomsCode ? now : null,
              now,
              addressId,
              memberId,
            ),
        );
        await db.batch(statements);
      } else {
        const statements = [];
        if (makeDefault) {
          statements.push(
            db
              .prepare(
                "UPDATE shipping_addresses SET is_default = 0 WHERE member_id = ?",
              )
              .bind(memberId),
          );
        }
        statements.push(
          db
            .prepare(
              `INSERT INTO shipping_addresses
                (member_id, label, recipient, phone, postal_code, address1,
                 address_detail, delivery_request, is_default, last_used_at,
                 customs_code_encrypted, customs_code_masked, customs_verified_at,
                 customs_expires_at, customs_save_consent_at,
                 created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?)`,
            )
            .bind(
              memberId,
              input.label,
              input.recipient,
              input.phone,
              input.postalCode,
              input.address1,
              input.addressDetail,
              input.deliveryRequest,
              makeDefault ? 1 : 0,
              input.saveCustomsCode ? customsEncrypted : "",
              input.saveCustomsCode ? customsMasked : "",
              input.saveCustomsCode ? customsVerifiedAt : null,
              input.saveCustomsCode ? customsExpiresAt : null,
              input.saveCustomsCode ? now : null,
              now,
              now,
            ),
        );
        await db.batch(statements);
      }
    } else if (payload.action === "address.default") {
      const addressId = Number(payload.addressId ?? 0);
      const existing = await db
        .prepare(
          "SELECT id FROM shipping_addresses WHERE id = ? AND member_id = ?",
        )
        .bind(addressId, memberId)
        .first();
      if (!existing) return jsonError("배송지를 찾을 수 없습니다.", 404);
      await db.batch([
        db
          .prepare("UPDATE shipping_addresses SET is_default = 0 WHERE member_id = ?")
          .bind(memberId),
        db
          .prepare(
            `UPDATE shipping_addresses
             SET is_default = 1, updated_at = ?
             WHERE id = ? AND member_id = ?`,
          )
          .bind(now, addressId, memberId),
      ]);
    } else if (payload.action === "address.delete") {
      const addressId = Number(payload.addressId ?? 0);
      const existing = await db
        .prepare(
          `SELECT id, is_default FROM shipping_addresses
           WHERE id = ? AND member_id = ?`,
        )
        .bind(addressId, memberId)
        .first<{ id: number; is_default: number }>();
      if (!existing) return jsonError("배송지를 찾을 수 없습니다.", 404);
      await db
        .prepare("DELETE FROM shipping_addresses WHERE id = ? AND member_id = ?")
        .bind(addressId, memberId)
        .run();
      if (existing.is_default) {
        await db
          .prepare(
            `UPDATE shipping_addresses
             SET is_default = 1, updated_at = ?
             WHERE id = (
               SELECT id FROM shipping_addresses
               WHERE member_id = ?
               ORDER BY CASE WHEN last_used_at IS NULL THEN 1 ELSE 0 END,
                        last_used_at DESC, updated_at DESC, id DESC
               LIMIT 1
             )`,
          )
          .bind(now, memberId)
          .run();
      }
    } else if (payload.action === "order.create") {
      const idempotencyKey = String(payload.idempotencyKey ?? "").trim().slice(0, 80);
      if (!/^[a-zA-Z0-9_-]{16,80}$/.test(idempotencyKey)) return jsonError("주문 요청 정보가 올바르지 않습니다. 주문서를 다시 열어 주세요.");
      const existingOrder = await db.prepare("SELECT id FROM orders WHERE member_id = ? AND idempotency_key = ?").bind(memberId, idempotencyKey).first();
      if (existingOrder) return storeResponse(await getStorePayload(member, "native", new URL(request.url).origin), nativeSession, request);
      let shipping = normalizeShippingInput(payload);
      let savedCustomsEncrypted = "";
      let savedCustomsMasked = "";
      let savedCustomsVerifiedAt: string | null = null;
      let savedCustomsExpiresAt: string | null = null;
      const shippingAddressId = Number(payload.shippingAddressId ?? 0);
      if (shippingAddressId) {
        const saved = await db
          .prepare(
            `SELECT * FROM shipping_addresses
             WHERE id = ? AND member_id = ?`,
          )
          .bind(shippingAddressId, memberId)
          .first<Record<string, unknown>>();
        if (!saved) return jsonError("선택한 배송지를 찾을 수 없습니다.", 404);
        shipping = {
          label: String(saved.label ?? "배송지"),
          recipient: String(saved.recipient ?? ""),
          phone: String(saved.phone ?? ""),
          postalCode: String(saved.postal_code ?? ""),
          address1: String(saved.address1 ?? ""),
          addressDetail: String(saved.address_detail ?? ""),
          deliveryRequest: String(
            payload.deliveryRequest ?? saved.delivery_request ?? "",
          )
            .trim()
            .slice(0, 120),
          isDefault: Boolean(saved.is_default),
          customsCode: "",
          customsNameConfirmed: true,
          saveCustomsCode: Boolean(saved.customs_save_consent_at),
        };
        savedCustomsEncrypted = String(saved.customs_code_encrypted ?? "");
        savedCustomsMasked = String(saved.customs_code_masked ?? "");
        savedCustomsVerifiedAt = saved.customs_verified_at ? String(saved.customs_verified_at) : null;
        savedCustomsExpiresAt = saved.customs_expires_at ? String(saved.customs_expires_at) : null;
      }
      const validationError = shippingInputError(shipping);
      if (validationError) return jsonError(validationError);
      if (!savedCustomsEncrypted && (!validCustomsCode(shipping.customsCode) || !shipping.customsNameConfirmed)) {
        return jsonError("해외직구 주문에는 수취인과 일치하는 개인통관고유부호가 필요합니다.");
      }
      if (savedCustomsExpiresAt && new Date(savedCustomsExpiresAt).getTime() <= Date.now()) {
        return jsonError("저장된 개인통관고유부호 확인기간이 지났습니다. 최신 번호를 다시 입력해 주세요.");
      }
      const orderCustomsEncrypted = savedCustomsEncrypted || await encryptPersonalValue(shipping.customsCode);
      const orderCustomsMasked = savedCustomsMasked || maskCustomsCode(shipping.customsCode);
      const orderCustomsVerifiedAt = savedCustomsVerifiedAt || now;
      const orderCustomsExpiresAt = savedCustomsExpiresAt || customsExpiry();
      const requestedCartIds = Array.isArray(payload.cartIds)
        ? Array.from(new Set(payload.cartIds.map(Number).filter((id) => Number.isInteger(id) && id > 0))).slice(0, 100)
        : [];
      const cartIdClause = requestedCartIds.length
        ? ` AND c.id IN (${requestedCartIds.map(() => "?").join(",")})`
        : "";
      const cart = await db
        .prepare(
          `SELECT c.product_id, c.quantity, c.selected_options, c.channel_id, c.channel_name,
                  p.name, p.point_price, p.stock, p.status, p.category, p.variants_json,
                  p.point_usage_mode, p.point_max_percent, p.cash_payment_enabled,
                  p.reward_on_cash_only
           FROM carts c JOIN products p ON p.id = c.product_id
           WHERE c.member_id = ?${cartIdClause} ORDER BY c.id`,
        )
        .bind(memberId, ...requestedCartIds)
        .all<{
          product_id: number;
          quantity: number;
          name: string;
          point_price: number;
          stock: number;
          status: string;
          selected_options: string;
          point_usage_mode: string;
          point_max_percent: number;
          cash_payment_enabled: number;
          reward_on_cash_only: number;
          channel_id: number | null;
          channel_name: string;
          category: string;
          variants_json: string;
        }>();
      if (!cart.results.length) return jsonError("장바구니가 비어 있습니다.");
      const operationSettingsRows = await db.prepare(`SELECT key, value FROM settings WHERE key IN ('feature_variant_stock_enabled','feature_shipping_enabled','shipping_base_fee','shipping_free_threshold','shipping_remote_fee','shipping_remote_prefixes','feature_discount_enabled','period_discount_name','period_discount_rate','period_discount_category','period_discount_starts_at','period_discount_ends_at','feature_member_tiers_enabled','member_tiers','cash_reward_rate','kakao_payment_hold_hours')`).all();
      const operationSettings = Object.fromEntries(operationSettingsRows.results.map((row) => [String(row.key), String(row.value)]));
      const variantEnabled = operationSettings.feature_variant_stock_enabled === "true";
      const cartItems = cart.results.map((item) => {
        const variant = variantEnabled ? matchingVariant(item.variants_json, item.selected_options) : null;
        return { ...item, variant, effectiveStock: variant ? Number(variant.stock) : Number(item.stock), point_price: Number(item.point_price) + Number(variant?.additionalPrice || 0) };
      });
      if (cartItems.some((item) => item.status !== "active" || item.effectiveStock < item.quantity || (variantEnabled && parseVariants(item.variants_json).length > 0 && (!item.variant || !item.variant.active)))) {
        return jsonError("재고가 부족하거나 판매 중지된 상품이 있습니다.");
      }
      const subtotal = cartItems.reduce(
        (sum, item) => sum + item.point_price * item.quantity,
        0,
      );
      const nowDate = new Date();
      const discountEnabled = operationSettings.feature_discount_enabled === "true";
      const periodStart = operationSettings.period_discount_starts_at ? new Date(`${operationSettings.period_discount_starts_at}T00:00:00+09:00`) : null;
      const periodEnd = operationSettings.period_discount_ends_at ? new Date(`${operationSettings.period_discount_ends_at}T23:59:59+09:00`) : null;
      const periodActive = discountEnabled && Number(operationSettings.period_discount_rate || 0) > 0 && (!periodStart || nowDate >= periodStart) && (!periodEnd || nowDate <= periodEnd);
      const periodCategory = operationSettings.period_discount_category || "전체";
      const periodBase = periodActive ? cartItems.filter((item) => periodCategory === "전체" || item.category === periodCategory).reduce((sum, item) => sum + item.point_price * item.quantity, 0) : 0;
      const periodDiscount = Math.floor(periodBase * Math.max(0, Math.min(100, Number(operationSettings.period_discount_rate || 0))) / 100);
      let coupon: Record<string, unknown> | null = null;
      let couponDiscount = 0;
      const couponId = Number(payload.couponId || 0);
      if (discountEnabled && couponId) {
        coupon = await db.prepare(`SELECT * FROM coupons WHERE id = ? AND claimed_by = ? AND status = '보관' AND coupon_type = 'discount'`).bind(couponId, memberId).first<Record<string, unknown>>() || null;
        if (!coupon) return jsonError("사용할 수 없는 할인쿠폰입니다.");
        if (coupon.expires_at && new Date(String(coupon.expires_at)).getTime() < Date.now()) return jsonError("만료된 할인쿠폰입니다.");
        const target = String(coupon.target_category || "전체");
        const couponBase = cartItems.filter((item) => target === "전체" || item.category === target).reduce((sum, item) => sum + item.point_price * item.quantity, 0);
        if (subtotal < Number(coupon.minimum_order || 0)) return jsonError(`이 쿠폰은 ${Number(coupon.minimum_order || 0).toLocaleString("ko-KR")}원 이상 주문에 사용할 수 있습니다.`);
        couponDiscount = String(coupon.discount_kind) === "percent" ? Math.floor(couponBase * Number(coupon.discount_value || 0) / 100) : Math.min(couponBase, Number(coupon.discount_value || 0));
      }
      const shippingEnabled = operationSettings.feature_shipping_enabled === "true";
      const freeThreshold = Number(operationSettings.shipping_free_threshold || 0);
      const baseShippingFee = shippingEnabled && (freeThreshold < 1 || subtotal - periodDiscount - couponDiscount < freeThreshold) ? Number(operationSettings.shipping_base_fee || 0) : 0;
      const remotePrefixes = String(operationSettings.shipping_remote_prefixes || "").split(",").map((entry) => entry.trim()).filter(Boolean);
      const remoteShippingFee = shippingEnabled && remotePrefixes.some((prefix) => shipping.postalCode.startsWith(prefix)) ? Number(operationSettings.shipping_remote_fee || 0) : 0;
      const shippingFee = Math.max(0, baseShippingFee + remoteShippingFee);
      const discountAmount = Math.min(subtotal, periodDiscount + couponDiscount);
      const total = Math.max(0, subtotal - discountAmount + shippingFee);
      const maxPointUse = Math.min(total, cartItems.reduce((sum, item) => {
        const mode = String(item.point_usage_mode || "full");
        const percent = mode === "none"
          ? 0
          : Math.max(0, Math.min(100, Number(item.point_max_percent ?? (mode === "partial" ? 50 : 100))));
        return sum + Math.floor((item.point_price * item.quantity * percent) / 100);
      }, shippingFee));
      const cashAllowed = cartItems.every((item) => Boolean(item.cash_payment_enabled));
      const requestedPoints = Math.max(0, Math.floor(Number(payload.usedPoints ?? maxPointUse)));
      const pointUse = Math.min(total, requestedPoints);
      if (pointUse > maxPointUse) {
        return jsonError(`이 주문에는 최대 ${maxPointUse.toLocaleString("ko-KR")}P까지 사용할 수 있습니다.`);
      }
      const cashAmount = total - pointUse;
      if (cashAmount > 0 && !cashAllowed) {
        return jsonError("현금 결제가 제한된 상품이 포함되어 있습니다.");
      }
      let remainingPointAllocation = pointUse;
      const rewardEligibleAmount = cartItems.reduce((sum, item) => {
        const itemTotal = item.point_price * item.quantity;
        const mode = String(item.point_usage_mode || "full");
        const percent = mode === "none"
          ? 0
          : Math.max(0, Math.min(100, Number(item.point_max_percent ?? (mode === "partial" ? 50 : 100))));
        const itemPointLimit = Math.floor((itemTotal * percent) / 100);
        const allocatedPoints = Math.min(remainingPointAllocation, itemPointLimit);
        remainingPointAllocation -= allocatedPoints;
        return sum + (Boolean(item.reward_on_cash_only) ? itemTotal - allocatedPoints : itemTotal);
      }, 0);
      let tier: { id: string; name: string; minSpend: number; rewardRate: number } | null = null;
      if (operationSettings.feature_member_tiers_enabled === "true") {
        const spend = await db.prepare(`SELECT COALESCE(SUM(total_points), 0) AS total FROM orders WHERE member_id = ? AND status NOT IN ('취소','반품완료')`).bind(memberId).first<{ total: number }>();
        tier = parseJsonArray<{ id: string; name: string; minSpend: number; rewardRate: number }>(operationSettings.member_tiers).sort((a, b) => Number(a.minSpend) - Number(b.minSpend)).filter((entry) => Number(spend?.total || 0) >= Number(entry.minSpend || 0)).at(-1) || null;
      }
      const cashRewardRate = Math.max(0, Math.min(100, Number(operationSettings.cash_reward_rate || 0) + Number(tier?.rewardRate || 0)));
      const purchaseRewardPoints = Math.floor((Math.max(0, rewardEligibleAmount - discountAmount) * cashRewardRate) / 100);
      const current = await db
        .prepare("SELECT points, charge_points, reward_points FROM members WHERE id = ?")
        .bind(memberId)
        .first<{ points: number; charge_points: number; reward_points: number }>();
      const reserved = await db
        .prepare(
          `SELECT COALESCE(SUM(used_charge_points), 0) AS charge,
                  COALESCE(SUM(used_reward_points), 0) AS reward
           FROM orders WHERE member_id = ? AND point_reservation_status = 'reserved'`,
        )
        .bind(memberId)
        .first<{ charge: number; reward: number }>();
      const availableReward = Math.max(0, Number(current?.reward_points ?? 0) - Number(reserved?.reward ?? 0));
      const availableCharge = Math.max(0, Number(current?.charge_points ?? 0) - Number(reserved?.charge ?? 0));
      if (!current || availableReward + availableCharge < pointUse) return jsonError("사용 가능한 리워드가 부족합니다.");
      const usedRewardPoints = Math.min(pointUse, availableReward);
      const usedChargePoints = pointUse - usedRewardPoints;
      if (availableCharge < usedChargePoints) {
        return jsonError("사용 가능한 리워드 잔액을 확인해 주세요.");
      }

      const attributedChannels = Array.from(new Map(
        cartItems
          .filter((item) => Number(item.channel_id) > 0)
          .map((item) => [Number(item.channel_id), { id: Number(item.channel_id), name: String(item.channel_name || "") }]),
      ).values());
      const attributedChannel = attributedChannels.length === 1 ? attributedChannels[0] : null;

      const orderNo = makeOrderNo();
      const isPointOnly = cashAmount === 0;
      const requestedCashChannel = String(payload.cashPaymentChannel || "bank_transfer");
      const cashPaymentChannel = isPointOnly
        ? ""
        : requestedCashChannel === "kakao_transfer"
          ? "kakao_transfer"
          : "bank_transfer";
      const paymentMethod = isPointOnly ? "points" : pointUse > 0 ? "mixed" : "cash";
      const paymentStatus = isPointOnly ? "paid" : "awaiting_cash";
      const reservationStatus = "reserved";
      const orderStatus = isPointOnly ? "접수" : "결제확인대기";
      const holdHours = Math.max(1, Math.min(168, Number(operationSettings.kakao_payment_hold_hours || 24)));
      const paymentExpiresAt = isPointOnly
        ? null
        : new Date(Date.now() + holdHours * 60 * 60 * 1000).toISOString();
      let orderResult;
      try {
        orderResult = await db
          .prepare(
          `INSERT INTO orders
            (order_no, idempotency_key, member_id, channel_id, channel_name, total_points, used_charge_points, used_reward_points,
             payment_method, cash_payment_channel, payment_status, cash_amount,
             purchase_reward_points, purchase_reward_status, point_reservation_status,
             payment_expires_at, status, recipient, phone, address, memo,
             postal_code, address1, address_detail, subtotal_points, shipping_fee,
             discount_amount, coupon_id, benefit_snapshot,
             delivery_stage, customs_status, customs_code_encrypted, customs_code_masked,
             customs_verified_at, customs_expires_at, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
          .bind(
          orderNo,
          idempotencyKey,
          memberId,
          attributedChannel?.id ?? null,
          attributedChannel?.name ?? "",
          total,
          usedChargePoints,
          usedRewardPoints,
          paymentMethod,
          cashPaymentChannel,
          paymentStatus,
          cashAmount,
          purchaseRewardPoints,
          purchaseRewardPoints > 0 ? "pending" : "none",
          reservationStatus,
          paymentExpiresAt,
          orderStatus,
          shipping.recipient,
          shipping.phone,
          combinedAddress(shipping),
          shipping.deliveryRequest,
          shipping.postalCode,
          shipping.address1,
          shipping.addressDetail,
          subtotal,
          shippingFee,
          discountAmount,
          coupon ? Number(coupon.id) : null,
          JSON.stringify({ periodDiscount, couponDiscount, tier: tier?.name || "", rewardRate: cashRewardRate }),
          "payment_confirmed",
          "waiting",
          orderCustomsEncrypted,
          orderCustomsMasked,
          orderCustomsVerifiedAt,
          orderCustomsExpiresAt,
          now,
          )
          .run();
      } catch (error) {
        if (error instanceof Error && /insufficient_reward/i.test(error.message)) {
          return jsonError("다른 주문에서 리워드를 먼저 사용했습니다. 사용 가능 잔액을 다시 확인해 주세요.", 409);
        }
        if (error instanceof Error && /unique|idempotency/i.test(error.message)) {
          return storeResponse(await getStorePayload(member, "native", new URL(request.url).origin), nativeSession, request);
        }
        throw error;
      }
      const orderId = Number(orderResult.meta.last_row_id);
      const nextBalance = Number(current.points) - pointUse;
      const orderStatements = [
        ...cartItems.map((item) =>
          db
            .prepare(
              `INSERT INTO order_items
                (order_id, product_id, product_name, point_price, selected_options, quantity, channel_id, channel_name)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            )
            .bind(
              orderId,
              item.product_id,
              item.name,
              item.point_price,
              item.selected_options,
              item.quantity,
              item.channel_id || null,
              item.channel_name || "",
            ),
        ),
        ...cartItems.map((item) =>
          db
            .prepare(
              "UPDATE products SET stock = stock - ?, sales_count = sales_count + ? WHERE id = ?",
            )
            .bind(item.quantity, item.quantity, item.product_id),
        ),
        ...cartItems.filter((item) => item.variant).map((item) => {
          const updated = parseVariants(item.variants_json).map((entry) => entry.key === item.variant?.key ? { ...entry, stock: Math.max(0, Number(entry.stock) - item.quantity) } : entry);
          return db
            .prepare(
              `UPDATE products
               SET variants_json = CASE WHEN variants_json = ? THEN ? ELSE variants_json END,
                   stock = CASE WHEN variants_json = ? THEN stock ELSE -1 END
               WHERE id = ?`,
            )
            .bind(item.variants_json, JSON.stringify(updated), item.variants_json, item.product_id);
        }),
        ...(coupon ? [db.prepare("UPDATE coupons SET status = '사용', used_by = ?, used_at = ? WHERE id = ? AND status = '보관'").bind(memberId, now, Number(coupon.id))] : []),
        ...(isPointOnly
          ? [
              db.prepare("UPDATE members SET points = ?, charge_points = charge_points - ?, reward_points = reward_points - ? WHERE id = ?").bind(nextBalance, usedChargePoints, usedRewardPoints, memberId),
              db.prepare("UPDATE orders SET point_reservation_status = 'captured' WHERE id = ? AND point_reservation_status = 'reserved'").bind(orderId),
              db
                .prepare(
                  `INSERT INTO point_logs
                    (member_id, amount, type, memo, balance_after, created_at, point_bucket)
                   VALUES (?, ?, '사용', ?, ?, ?, 'mixed')`,
                )
                .bind(memberId, -pointUse, `${orderNo} 포인트 결제`, nextBalance, now),
            ]
          : []),
        requestedCartIds.length
          ? db.prepare(`DELETE FROM carts WHERE member_id = ? AND id IN (${requestedCartIds.map(() => "?").join(",")})`).bind(memberId, ...requestedCartIds)
          : db.prepare("DELETE FROM carts WHERE member_id = ?").bind(memberId),
      ];
      if (shippingAddressId) {
        orderStatements.push(
          db
            .prepare(
              `UPDATE shipping_addresses
               SET last_used_at = ?, delivery_request = ?, updated_at = ?
               WHERE id = ? AND member_id = ?`,
            )
            .bind(
              now,
              shipping.deliveryRequest,
              now,
              shippingAddressId,
              memberId,
            ),
        );
      } else if (payload.saveAddress) {
        const currentDefault = await db
          .prepare(
            "SELECT id FROM shipping_addresses WHERE member_id = ? AND is_default = 1 LIMIT 1",
          )
          .bind(memberId)
          .first();
        const makeDefault = shipping.isDefault || !currentDefault;
        if (makeDefault) {
          orderStatements.push(
            db
              .prepare(
                "UPDATE shipping_addresses SET is_default = 0 WHERE member_id = ?",
              )
              .bind(memberId),
          );
        }
        orderStatements.push(
          db
            .prepare(
              `INSERT INTO shipping_addresses
                (member_id, label, recipient, phone, postal_code, address1,
                 address_detail, delivery_request, is_default, last_used_at,
                 customs_code_encrypted, customs_code_masked, customs_verified_at,
                 customs_expires_at, customs_save_consent_at,
                 created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            )
            .bind(
              memberId,
              shipping.label,
              shipping.recipient,
              shipping.phone,
              shipping.postalCode,
              shipping.address1,
              shipping.addressDetail,
              shipping.deliveryRequest,
              makeDefault ? 1 : 0,
              now,
              shipping.saveCustomsCode ? orderCustomsEncrypted : "",
              shipping.saveCustomsCode ? orderCustomsMasked : "",
              shipping.saveCustomsCode ? orderCustomsVerifiedAt : null,
              shipping.saveCustomsCode ? orderCustomsExpiresAt : null,
              shipping.saveCustomsCode ? now : null,
              now,
              now,
            ),
        );
      }
      try {
        await db.batch(orderStatements);
      } catch (error) {
        await db.prepare("DELETE FROM orders WHERE id = ? AND member_id = ?").bind(orderId, memberId).run();
        if (error instanceof Error && /insufficient_reward/i.test(error.message)) {
          return jsonError("다른 주문에서 리워드를 먼저 사용했습니다. 사용 가능 잔액을 다시 확인해 주세요.", 409);
        }
        if (error instanceof Error && /insufficient_stock|stock/i.test(error.message)) {
          return jsonError("결제 직전에 재고가 소진되었습니다. 장바구니 수량을 다시 확인해 주세요.", 409);
        }
        throw error;
      }
    } else if (payload.action === "order.claim.request") {
      const orderId = Number(payload.orderId ?? 0);
      const claimType = ["return", "exchange", "refund"].includes(String(payload.claimType)) ? String(payload.claimType) : "return";
      const reasonType = String(payload.reasonType ?? "").trim().slice(0, 40);
      const reasonDetail = String(payload.reasonDetail ?? "").trim().slice(0, 1000);
      if (!reasonType || reasonDetail.length < 10) return jsonError("신청 사유와 상세 내용을 10자 이상 입력해 주세요.");
      const order = await db.prepare("SELECT id, status FROM orders WHERE id = ? AND member_id = ?").bind(orderId, memberId).first<{ id: number; status: string }>();
      if (!order) return jsonError("주문을 찾을 수 없습니다.", 404);
      if (!["배송중", "배송완료"].includes(order.status)) return jsonError("배송이 시작된 주문만 반품·교환을 신청할 수 있습니다.");
      const existing = await db.prepare("SELECT id FROM order_claims WHERE order_id = ? AND member_id = ? AND status NOT IN ('rejected','completed','cancelled') LIMIT 1").bind(orderId, memberId).first();
      if (existing) return jsonError("이미 처리 중인 신청이 있습니다.");
      const sellerFault = ["defect", "wrong_item", "damaged"].includes(reasonType);
      const settings = await db.prepare("SELECT value FROM settings WHERE key = 'shipping_return_fee'").first<{ value: string }>();
      await db.prepare(`INSERT INTO order_claims
        (order_id, member_id, claim_type, reason_type, reason_detail, evidence_json,
         cost_bearer, return_fee, status, admin_note, requested_at, updated_at)
        VALUES (?, ?, ?, ?, ?, '[]', ?, ?, 'requested', '', ?, ?)`)
        .bind(orderId, memberId, claimType, reasonType, reasonDetail, sellerFault ? "platform" : "customer", sellerFault ? 0 : Math.max(0, Number(settings?.value || 0)), now, now).run();
      await db.prepare("UPDATE orders SET status = '반품요청' WHERE id = ? AND member_id = ?").bind(orderId, memberId).run();
    } else if (payload.action === "order.cancel.request") {
      const orderId = Number(payload.orderId ?? 0);
      const order = await db
        .prepare("SELECT id, order_no, status, payment_status, point_reservation_status, coupon_id FROM orders WHERE id = ? AND member_id = ?")
        .bind(orderId, memberId)
        .first<{ id: number; order_no: string; status: string; payment_status: string; point_reservation_status: string; coupon_id: number | null }>();
      if (!order) return jsonError("주문을 찾을 수 없습니다.", 404);
      if (["취소", "반품완료", "취소요청"].includes(order.status)) return jsonError("이미 취소 처리 중이거나 완료된 주문입니다.");
      if (["배송중", "배송완료"].includes(order.status)) return jsonError("배송이 시작된 주문은 고객센터로 반품을 문의해 주세요.");
      const awaitingPayment = ["awaiting_cash", "awaiting_kakao"].includes(order.payment_status) && order.point_reservation_status === "reserved";
      if (!awaitingPayment) {
        const requested = await db.prepare("UPDATE orders SET status = '취소요청' WHERE id = ? AND member_id = ? AND status IN ('접수','상품준비')").bind(orderId, memberId).run();
        if (!Number(requested.meta.changes ?? 0)) return jsonError("현재 주문 상태에서는 취소를 요청할 수 없습니다.");
      } else {
        const claimed = await db.prepare("UPDATE orders SET status = '취소', payment_status = 'canceled', point_reservation_status = 'released' WHERE id = ? AND member_id = ? AND point_reservation_status = 'reserved' AND payment_status IN ('awaiting_cash','awaiting_kakao')").bind(orderId, memberId).run();
        if (!Number(claimed.meta.changes ?? 0)) return jsonError("주문 상태가 변경되어 취소하지 못했습니다. 다시 확인해 주세요.");
        const items = await db.prepare("SELECT product_id, quantity, selected_options FROM order_items WHERE order_id = ?").bind(orderId).all<{ product_id: number; quantity: number; selected_options: string }>();
        const variantRestores = [];
        for (const item of items.results) {
          let selected: Record<string, string> = {};
          try { selected = JSON.parse(item.selected_options || "{}"); } catch { selected = {}; }
          if (!Object.keys(selected).length) continue;
          const product = await db.prepare("SELECT variants_json FROM products WHERE id = ?").bind(item.product_id).first<{ variants_json: string }>();
          const variants = parseVariants(product?.variants_json);
          const updated = variants.map((variant) => Object.entries(selected).every(([name, value]) => String(variant.options?.[name]) === String(value)) ? { ...variant, stock: Number(variant.stock || 0) + item.quantity } : variant);
          variantRestores.push(db.prepare("UPDATE products SET variants_json = ? WHERE id = ?").bind(JSON.stringify(updated), item.product_id));
        }
        await db.batch([
          ...items.results.map((item) => db.prepare("UPDATE products SET stock = stock + ?, sales_count = MAX(0, sales_count - ?) WHERE id = ?").bind(item.quantity, item.quantity, item.product_id)),
          ...variantRestores,
          ...(order.coupon_id ? [db.prepare("UPDATE coupons SET status = '보관', used_by = NULL, used_at = NULL WHERE id = ? AND coupon_type = 'discount' AND status = '사용'").bind(order.coupon_id)] : []),
        ]);
      }
    } else if (payload.action === "order.address.update") {
      const orderId = Number(payload.orderId ?? 0);
      const order = await db
        .prepare(
          "SELECT id, status FROM orders WHERE id = ? AND member_id = ?",
        )
        .bind(orderId, memberId)
        .first<{ id: number; status: string }>();
      if (!order) return jsonError("주문을 찾을 수 없습니다.", 404);
      if (order.status !== "접수" && order.status !== "결제확인대기") {
        return jsonError(
          "상품 준비가 시작된 주문은 배송지를 직접 변경할 수 없습니다. 고객센터로 문의해 주세요.",
        );
      }
      let shipping = normalizeShippingInput(payload);
      const shippingAddressId = Number(payload.shippingAddressId ?? 0);
      if (shippingAddressId) {
        const saved = await db
          .prepare(
            "SELECT * FROM shipping_addresses WHERE id = ? AND member_id = ?",
          )
          .bind(shippingAddressId, memberId)
          .first<Record<string, unknown>>();
        if (!saved) return jsonError("선택한 배송지를 찾을 수 없습니다.", 404);
        shipping = {
          label: String(saved.label ?? "배송지"),
          recipient: String(saved.recipient ?? ""),
          phone: String(saved.phone ?? ""),
          postalCode: String(saved.postal_code ?? ""),
          address1: String(saved.address1 ?? ""),
          addressDetail: String(saved.address_detail ?? ""),
          deliveryRequest: String(
            payload.deliveryRequest ?? saved.delivery_request ?? "",
          )
            .trim()
            .slice(0, 120),
          isDefault: Boolean(saved.is_default),
          customsCode: "",
          customsNameConfirmed: Boolean(saved.customs_code_encrypted),
          saveCustomsCode: Boolean(saved.customs_save_consent_at),
        };
      }
      const validationError = shippingInputError(shipping);
      if (validationError) return jsonError(validationError);
      const result = await db
        .prepare(
          `UPDATE orders
           SET recipient = ?, phone = ?, address = ?, memo = ?, postal_code = ?,
               address1 = ?, address_detail = ?, address_updated_at = ?
           WHERE id = ? AND member_id = ? AND status IN ('결제확인대기', '접수')`,
        )
        .bind(
          shipping.recipient,
          shipping.phone,
          combinedAddress(shipping),
          shipping.deliveryRequest,
          shipping.postalCode,
          shipping.address1,
          shipping.addressDetail,
          now,
          orderId,
          memberId,
        )
        .run();
      if (!Number(result.meta.changes ?? 0)) {
        return jsonError("주문 상태가 변경되어 배송지를 수정할 수 없습니다.");
      }
      if (shippingAddressId) {
        await db
          .prepare(
            `UPDATE shipping_addresses
             SET last_used_at = ?, delivery_request = ?, updated_at = ?
             WHERE id = ? AND member_id = ?`,
          )
          .bind(now, shipping.deliveryRequest, now, shippingAddressId, memberId)
          .run();
      }
    } else if (payload.action === "finance.create") {
      return jsonError("현금 선충전·환급 신청 기능은 사용하지 않습니다. 주문할 때 리워드를 적용하고 남은 금액만 결제해 주세요.", 410);
    } else if (payload.action === "review.create") {
      const orderItemId = Number(payload.orderItemId);
      const rating = Math.min(5, Math.max(1, Number(payload.rating ?? 5)));
      const title = String(payload.title ?? "").trim();
      const content = String(payload.content ?? "").trim();
      if (!title || !content) {
        return jsonError("후기 제목과 내용을 입력해 주세요.");
      }
      const policyRows = await db
        .prepare(
          `SELECT key, value FROM settings
           WHERE key IN (
             'review_text_points', 'review_photo_points', 'review_write_days',
             'review_min_length', 'review_max_images', 'review_auto_publish'
           )`,
        )
        .all();
      const policy = Object.fromEntries(
        policyRows.results.map((row) => [String(row.key), String(row.value)]),
      );
      const minLength = Math.max(1, Number(policy.review_min_length || 20));
      const maxImages = Math.min(8, Math.max(0, Number(policy.review_max_images || 4)));
      if (content.length < minLength) {
        return jsonError(`후기 내용은 ${minLength}자 이상 작성해 주세요.`);
      }
      const imageUrls = Array.from(
        new Set(
          (payload.imageUrls ?? [])
            .map((value) => String(value).trim())
            .filter(
              (value) =>
                /^https?:\/\//i.test(value) ||
                value.startsWith("/api/review-image?key="),
            ),
        ),
      ).slice(0, maxImages);
      const ordered = await db
        .prepare(
          `SELECT oi.id AS order_item_id, oi.order_id, oi.product_id, oi.product_name,
                  o.order_no, o.status, o.delivered_at, o.created_at,
                  r.id AS review_id
           FROM order_items oi
           JOIN orders o ON o.id = oi.order_id
           LEFT JOIN reviews r ON r.order_item_id = oi.id
           WHERE oi.id = ? AND o.member_id = ?`,
        )
        .bind(orderItemId, memberId)
        .first<{
          order_item_id: number;
          order_id: number;
          product_id: number;
          product_name: string;
          order_no: string;
          status: string;
          delivered_at: string | null;
          created_at: string;
          review_id: number | null;
        }>();
      if (!ordered) return jsonError("주문상품을 확인할 수 없습니다.");
      if (!["배송완료", "완료"].includes(ordered.status)) {
        return jsonError("배송완료된 주문상품만 후기를 작성할 수 있습니다.");
      }
      if (ordered.review_id) {
        return jsonError("이 주문상품의 후기는 이미 작성했습니다.");
      }
      const reviewDays = Math.max(1, Number(policy.review_write_days || 90));
      const deadline = new Date(ordered.delivered_at || ordered.created_at);
      deadline.setDate(deadline.getDate() + reviewDays);
      if (deadline.getTime() < Date.now()) {
        return jsonError(`배송완료 후 ${reviewDays}일 이내에 후기를 작성해 주세요.`);
      }
      const rewardPoints = Math.max(
        0,
        Number(
          imageUrls.length
            ? policy.review_photo_points || 500
            : policy.review_text_points || 300,
        ),
      );
      const visible = policy.review_auto_publish !== "false" ? 1 : 0;
      await db.batch([
        db
          .prepare(
            `INSERT INTO reviews
              (member_id, product_id, order_id, order_item_id, rating, title, content,
               image_urls, visible, reward_points, reward_status, rewarded_at, updated_at, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '지급', ?, ?, ?)`,
          )
          .bind(
            memberId,
            ordered.product_id,
            ordered.order_id,
            ordered.order_item_id,
            rating,
            title,
            content,
            JSON.stringify(imageUrls),
            visible,
            rewardPoints,
            now,
            now,
            now,
          ),
        db
          .prepare("UPDATE members SET points = points + ?, reward_points = reward_points + ? WHERE id = ?")
          .bind(rewardPoints, rewardPoints, memberId),
        db
          .prepare(
            `INSERT INTO point_logs
              (member_id, amount, type, memo, balance_after, created_at, point_bucket)
             SELECT ?, ?, '후기적립', ?, points, ?, 'reward' FROM members WHERE id = ?`,
          )
          .bind(
            memberId,
            rewardPoints,
            `${ordered.order_no} ${ordered.product_name} 상품후기 적립`,
            now,
            memberId,
          ),
      ]);
    } else if (payload.action === "attendance.check") {
      const attendanceSettings = await db
        .prepare(
          `SELECT key, value FROM settings
           WHERE key IN (
             'attendance_enabled', 'attendance_daily_points',
             'attendance_streak_days', 'attendance_streak_bonus'
           )`,
        )
        .all();
      const policy = Object.fromEntries(
        attendanceSettings.results.map((row) => [
          String(row.key),
          String(row.value),
        ]),
      );
      if (policy.attendance_enabled === "false") {
        return jsonError("현재 출석체크가 운영되지 않습니다.");
      }
      const attendanceDate = seoulDateKey();
      const previousDate = previousSeoulDateKey();
      const previous = await db
        .prepare(
          `SELECT streak FROM attendance_records
           WHERE member_id = ? AND attendance_date = ?`,
        )
        .bind(memberId, previousDate)
        .first<{ streak: number }>();
      const streak = previous ? Number(previous.streak) + 1 : 1;
      const dailyPoints = Math.max(
        0,
        Math.min(100000, Number(policy.attendance_daily_points || 100)),
      );
      const streakDays = Math.max(
        2,
        Math.min(31, Number(policy.attendance_streak_days || 7)),
      );
      const streakBonus =
        streak % streakDays === 0
          ? Math.max(
              0,
              Math.min(1000000, Number(policy.attendance_streak_bonus || 500)),
            )
          : 0;
      const rewardPoints = dailyPoints + streakBonus;
      try {
        await db.batch([
          db
            .prepare(
              `INSERT INTO attendance_records
                (member_id, attendance_date, streak, base_points, bonus_points,
                 total_points, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)`,
            )
            .bind(
              memberId,
              attendanceDate,
              streak,
              dailyPoints,
              streakBonus,
              rewardPoints,
              now,
            ),
          db
            .prepare("UPDATE members SET points = points + ?, reward_points = reward_points + ? WHERE id = ?")
            .bind(rewardPoints, rewardPoints, memberId),
          db
            .prepare(
              `INSERT INTO point_logs
                (member_id, amount, type, memo, balance_after, created_at, point_bucket)
               SELECT ?, ?, '출석적립', ?, points, ?, 'reward' FROM members WHERE id = ?`,
            )
            .bind(
              memberId,
              rewardPoints,
              streakBonus
                ? `${streak}일 연속 출석 (${fmtAttendancePoints(dailyPoints)} + 보너스 ${fmtAttendancePoints(streakBonus)})`
                : `${streak}일 연속 출석`,
              now,
              memberId,
            ),
        ]);
      } catch (error) {
        if (
          error instanceof Error &&
          /unique|attendance_records_member_date_unique/i.test(error.message)
        ) {
          return jsonError("오늘 출석체크는 이미 완료했습니다.");
        }
        throw error;
      }
    } else if (payload.action === "coupon.redeem") {
      const code = String(payload.code ?? "").trim().toUpperCase();
      if (!code) return jsonError("쿠폰 코드를 입력해 주세요.");
      const coupon = await db
        .prepare("SELECT * FROM coupons WHERE code = ?")
        .bind(code)
        .first<Record<string, unknown>>();
      if (!coupon || coupon.status !== "미사용") {
        return jsonError("사용할 수 없는 쿠폰입니다.");
      }
      if (coupon.expires_at && new Date(coupon.expires_at).getTime() < Date.now()) {
        return jsonError("사용기간이 지난 쿠폰입니다.");
      }
      if (String(coupon.coupon_type || "point") === "discount") {
        const discountEnabled = (await db.prepare("SELECT value FROM settings WHERE key = 'feature_discount_enabled'").first<{ value: string }>())?.value === "true";
        if (!discountEnabled) return jsonError("현재 할인쿠폰 기능을 사용하지 않습니다.");
        const claimed = await db.prepare("UPDATE coupons SET status = '보관', claimed_by = ?, claimed_at = ? WHERE id = ? AND status = '미사용'").bind(memberId, now, Number(coupon.id)).run();
        if (!Number(claimed.meta.changes ?? 0)) return jsonError("다른 회원이 먼저 등록한 쿠폰입니다.", 409);
      } else {
      const claimed = await db
        .prepare("UPDATE coupons SET status = '사용', used_by = ?, used_at = ? WHERE id = ? AND status = '미사용'")
        .bind(memberId, now, coupon.id)
        .run();
      if (!Number(claimed.meta.changes ?? 0)) return jsonError("다른 회원이 먼저 등록한 쿠폰입니다.", 409);
      await db.batch([
        db.prepare("UPDATE members SET points = points + ?, reward_points = reward_points + ? WHERE id = ?").bind(Number(coupon.point_amount), Number(coupon.point_amount), memberId),
        db
          .prepare(
            `INSERT INTO point_logs
              (member_id, amount, type, memo, balance_after, created_at, point_bucket)
             SELECT ?, ?, '쿠폰', ?, points, ?, 'reward' FROM members WHERE id = ?`,
          )
          .bind(memberId, Number(coupon.point_amount), `${code} 쿠폰 등록`, now, memberId),
      ]);
      }
    } else if (payload.action === "inquiry.create") {
      const title = String(payload.title ?? "").trim();
      const content = String(payload.content ?? "").trim();
      const productId = Number(payload.productId ?? 0);
      if (!title || !content) return jsonError("문의 제목과 내용을 입력해 주세요.");
      if (productId) {
        const product = await db
          .prepare("SELECT id FROM products WHERE id = ? AND status != 'deleted'")
          .bind(productId)
          .first();
        if (!product) return jsonError("상품을 찾을 수 없습니다.");
      }
      await db
        .prepare(
          `INSERT INTO inquiries
            (member_id, product_id, category, title, content, answer, status, created_at, answered_at)
           VALUES (?, ?, ?, ?, ?, '', '접수', ?, NULL)`,
        )
        .bind(
          memberId,
          productId || null,
          String(payload.category ?? "이용문의"),
          title,
          content,
          now,
        )
        .run();
    } else if (payload.action === "channel.apply") {
      const existing = await db.prepare("SELECT id FROM sales_channels WHERE owner_member_id = ? LIMIT 1").bind(memberId).first();
      if (existing) return jsonError("이미 채널 신청 또는 운영 기록이 있습니다.", 409);
      const name = String(payload.name ?? "").trim().slice(0, 80);
      const applicationMessage = String(payload.applicationMessage ?? "").trim().slice(0, 1000);
      if (name.length < 2) return jsonError("희망 채널명을 두 글자 이상 입력해 주세요.");
      if (applicationMessage.length < 10) return jsonError("방송할 내용과 운영 계획을 10자 이상 적어 주세요.");
      await db.prepare(
        `INSERT INTO sales_channels
          (slug, name, operator_name, description, owner_member_id, application_status,
           application_message, status, showcase_visible, applied_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'pending', ?, 'draft', 0, ?, ?, ?)`,
      ).bind(`member-channel-${memberId}`, name, String(member.name || ""), applicationMessage, memberId, applicationMessage, now, now, now).run();
    } else if (payload.action === "channel.category.request") {
      const channel = await db.prepare("SELECT id, application_status, broadcast_settings FROM sales_channels WHERE owner_member_id = ? LIMIT 1").bind(memberId).first<Record<string, unknown>>();
      if (!channel) return jsonError("내 채널을 찾을 수 없습니다.", 404);
      if (!["approved", "revision_requested", "publication_review", "published"].includes(String(channel.application_status))) return jsonError("관리자 승인 후 카테고리 변경을 요청할 수 있습니다.", 403);
      const linked = await db.prepare("SELECT product_id FROM sales_channel_products WHERE channel_id = ?").bind(Number(channel.id)).all<{ product_id: number }>();
      const linkedIds = new Set(linked.results.map((row) => Number(row.product_id)));
      const categories = (Array.isArray(payload.categories) ? payload.categories : []).slice(0, 50).map((item, index) => ({
        sourceName: `member-request-${index + 1}`,
        label: String(item.label || "").trim().slice(0, 50),
        visible: true,
        sortOrder: index,
        productIds: Array.from(new Set((Array.isArray(item.productIds) ? item.productIds : []).map(Number).filter((id) => linkedIds.has(id)))),
      })).filter((item) => item.label);
      if (!categories.length) return jsonError("검토받을 카테고리를 하나 이상 입력해 주세요.");
      let broadcast: Record<string, unknown> = {};
      try { broadcast = JSON.parse(String(channel.broadcast_settings || "{}")); } catch { broadcast = {}; }
      const previous = Array.isArray(broadcast.member_category_requests) ? broadcast.member_category_requests as Array<Record<string, unknown>> : [];
      broadcast.member_category_requests = [...previous.filter((item) => item.status !== "pending").slice(-9), {
        id: `category-request-${Date.now()}`, status: "pending", categories, requestedAt: now, note: "",
      }];
      await db.prepare("UPDATE sales_channels SET broadcast_settings = ?, updated_at = ? WHERE id = ? AND owner_member_id = ?")
        .bind(JSON.stringify(broadcast), now, Number(channel.id), memberId).run();
    } else if (payload.action === "channel.member.save") {
      const channel = await db.prepare("SELECT id, application_status, broadcast_settings FROM sales_channels WHERE owner_member_id = ? LIMIT 1").bind(memberId).first<Record<string, unknown>>();
      if (!channel) return jsonError("내 채널을 찾을 수 없습니다.", 404);
      if (!["approved", "revision_requested", "publication_review", "published"].includes(String(channel.application_status))) return jsonError("관리자 승인 후 채널을 수정할 수 있습니다.", 403);
      const name = String(payload.name ?? "").trim().slice(0, 80);
      const operatorName = String(payload.operatorName ?? member.name ?? "").trim().slice(0, 80);
      const description = String(payload.description ?? "").trim().slice(0, 500);
      const youtubeUrl = String(payload.youtubeUrl ?? "").trim().slice(0, 500);
      const safeChannelImage = (value: unknown) => {
        const url = String(value ?? "").trim().slice(0, 500);
        return !url || /^\/api\/channel-image\?key=channels%2F/i.test(url) ? url : "";
      };
      const imageUrl = safeChannelImage(payload.imageUrl);
      const avatarImageUrl = safeChannelImage(payload.avatarImageUrl);
      const originalImageUrl = safeChannelImage(payload.originalImageUrl);
      const themeColor = /^#[0-9a-f]{6}$/i.test(String(payload.themeColor || "")) ? String(payload.themeColor) : "#111827";
      if (name.length < 2 || description.length < 10) return jsonError("채널명과 소개를 충분히 입력해 주세요.");
      if (youtubeUrl && !/^https:\/\/(?:www\.)?(?:youtube\.com|youtu\.be)\//i.test(youtubeUrl)) return jsonError("유튜브 주소를 확인해 주세요.");
      let broadcast: Record<string, unknown> = {};
      try { broadcast = JSON.parse(String(channel.broadcast_settings || "{}")); } catch { broadcast = {}; }
      broadcast.youtube_live_title = String(payload.broadcastTitle ?? "").trim().slice(0, 120);
      broadcast.youtube_live_notice = String(payload.broadcastNotice ?? "").trim().slice(0, 500);
      broadcast.youtube_live_url = youtubeUrl;
      broadcast.youtube_live_enabled = payload.liveEnabled === true ? "true" : "false";
      broadcast.youtube_live_orientation = payload.liveOrientation === "vertical" ? "vertical" : "horizontal";
      const liveSlotNumbers = Array.from(new Set((Array.isArray(payload.liveSlotNumbers) ? payload.liveSlotNumbers : []).map(Number).filter((value) => Number.isInteger(value) && value > 0 && value <= 9999))).slice(0, 200).sort((a, b) => a - b);
      const liveSlots = (Array.isArray(payload.liveSlots) ? payload.liveSlots : []).map((item) => ({ number: Number(item.number), productId: Number(item.productId) })).filter((item) => liveSlotNumbers.includes(item.number) && Number.isInteger(item.productId) && item.productId > 0).slice(0, 200);
      broadcast.youtube_live_slot_numbers = JSON.stringify(liveSlotNumbers);
      broadcast.youtube_live_slot_count = String(liveSlotNumbers.length);
      broadcast.youtube_live_slots = JSON.stringify(liveSlots);
      broadcast.youtube_live_product_ids = JSON.stringify(liveSlots.map((item) => item.productId));
      const productIds = Array.from(new Set((Array.isArray(payload.productIds) ? payload.productIds : []).map(Number).filter((id) => Number.isInteger(id) && id > 0))).slice(0, 2000);
      const replays = (Array.isArray(payload.replays) ? payload.replays : []).slice(0, 100).map((item, index) => ({
        id: String(item.id || `member-replay-${index + 1}`).slice(0, 80), title: String(item.title || "").trim().slice(0, 120),
        youtubeUrl: String(item.youtubeUrl || "").trim().slice(0, 500), date: String(item.date || "").slice(0, 10),
        orientation: item.orientation === "vertical" ? "vertical" : "horizontal", completed: item.completed === true,
        timeline: (Array.isArray(item.timeline) ? item.timeline : []).slice(0, 500).map((entry, timelineIndex) => ({
          id: String(entry.id || `member-time-${timelineIndex + 1}`).slice(0, 80),
          time: Math.max(0, Number(entry.time || 0)), broadcastNumber: Math.max(0, Number(entry.broadcastNumber || 0)),
          productId: Number(entry.productId || 0), needsReview: entry.needsReview !== false,
        })).filter((entry) => !entry.productId || productIds.includes(entry.productId)),
      })).filter((item) => item.title && /^https:\/\/(?:www\.)?(?:youtube\.com|youtu\.be)\//i.test(item.youtubeUrl));
      const shorts = (Array.isArray(payload.shorts) ? payload.shorts : []).slice(0, 200).map((item, index) => ({
        id: String(item.id || `member-short-${index + 1}`).slice(0, 80), title: String(item.title || "").trim().slice(0, 120),
        youtubeUrl: String(item.youtubeUrl || "").trim().slice(0, 500), productId: Number(item.productId || 0), visible: item.visible !== false,
      })).filter((item) => item.title && /^https:\/\/(?:www\.)?(?:youtube\.com|youtu\.be)\//i.test(item.youtubeUrl) && (!item.productId || productIds.includes(item.productId)));
      broadcast.youtube_replays = JSON.stringify(replays);
      broadcast.youtube_shorts = JSON.stringify(shorts);
      const rawContact = payload.contactSettings && typeof payload.contactSettings === "object" ? payload.contactSettings : {};
      const contactSettings = {
        use_channel_contact: "true",
        contact_counselor_name: String(rawContact.contact_counselor_name || "").trim().slice(0, 80),
        contact_counselor_image_url: safeChannelImage(rawContact.contact_counselor_image_url),
        contact_kakao_enabled: rawContact.contact_kakao_enabled === false ? "false" : "true",
        contact_kakao_url: String(rawContact.contact_kakao_url || "").trim().slice(0, 500),
        contact_telegram_enabled: rawContact.contact_telegram_enabled === false ? "false" : "true",
        contact_telegram_url: String(rawContact.contact_telegram_url || "").trim().slice(0, 500),
        contact_line_enabled: rawContact.contact_line_enabled === false ? "false" : "true",
        contact_line_url: String(rawContact.contact_line_url || "").trim().slice(0, 500),
        contact_live_enabled: rawContact.contact_live_enabled === false ? "false" : "true",
        contact_live_url: String(rawContact.contact_live_url || "").trim().slice(0, 500),
      };
      const validProducts = productIds.length ? await db.prepare(`SELECT id FROM products WHERE status = 'active' AND id IN (${productIds.map(() => "?").join(",")})`).bind(...productIds).all<{ id: number }>() : { results: [] };
      const validProductIds = new Set(validProducts.results.map((item) => Number(item.id)));
      const safeProductIds = productIds.filter((id) => validProductIds.has(id));
      const safeLiveSlots = liveSlots.filter((item) => safeProductIds.includes(item.productId));
      broadcast.youtube_live_slots = JSON.stringify(safeLiveSlots);
      broadcast.youtube_live_product_ids = JSON.stringify(safeLiveSlots.map((item) => item.productId));
      const channelId = Number(channel.id);
      const statements = [db.prepare(
        `UPDATE sales_channels SET name = ?, operator_name = ?, description = ?, youtube_url = ?, image_url = ?, avatar_image_url = ?, original_image_url = ?, theme_color = ?,
           broadcast_settings = ?, contact_settings = ?, application_status = CASE WHEN application_status = 'revision_requested' THEN 'approved' ELSE application_status END,
           updated_at = ? WHERE id = ? AND owner_member_id = ?`,
      ).bind(name, operatorName, description, youtubeUrl, imageUrl, avatarImageUrl, originalImageUrl, themeColor, JSON.stringify(broadcast), JSON.stringify(contactSettings), now, channelId, memberId),
      db.prepare("DELETE FROM sales_channel_products WHERE channel_id = ?").bind(channelId),
      ...safeProductIds.map((productId, index) => db.prepare("INSERT INTO sales_channel_products (channel_id, product_id, sort_order, created_at) VALUES (?, ?, ?, ?)").bind(channelId, productId, index, now))];
      await db.batch(statements);
    } else if (payload.action === "channel.live.quickProduct" || payload.action === "channel.live.resetHistory") {
      const channel = await db.prepare("SELECT id, broadcast_settings FROM sales_channels WHERE owner_member_id = ? LIMIT 1").bind(memberId).first<Record<string, unknown>>();
      if (!channel) return jsonError("내 채널을 찾을 수 없습니다.", 404);
      let broadcast: Record<string, string> = {};
      try { broadcast = JSON.parse(String(channel.broadcast_settings || "{}")); } catch { broadcast = {}; }
      if (payload.action === "channel.live.quickProduct") {
        const requestedNumber = Math.max(1, Math.min(9999, Math.floor(Number(payload.number || 0))));
        let slots: Array<{ number: number; productId: number }> = [];
        let history: number[] = [];
        try { slots = JSON.parse(broadcast.youtube_live_slots || "[]"); } catch { slots = []; }
        try { history = JSON.parse(broadcast.youtube_live_history || "[]"); } catch { history = []; }
        if (!slots.some((slot) => Number(slot.number) === requestedNumber && Number(slot.productId) > 0)) return jsonError(`${requestedNumber}번에 연결된 상품이 없습니다.`);
        broadcast.youtube_live_current_number = String(requestedNumber);
        broadcast.youtube_live_history = JSON.stringify([...history.filter((number) => Number(number) !== requestedNumber), requestedNumber].slice(-30));
      } else {
        broadcast.youtube_live_current_number = "";
        broadcast.youtube_live_history = "[]";
      }
      await db.prepare("UPDATE sales_channels SET broadcast_settings = ?, updated_at = ? WHERE id = ? AND owner_member_id = ?").bind(JSON.stringify(broadcast), now, Number(channel.id), memberId).run();
      return Response.json({ partial: "channel.live", liveRefresh: true });
    } else if (payload.action === "channel.publication.request") {
      const changed = await db.prepare(
        `UPDATE sales_channels SET application_status = 'publication_review', publication_requested_at = ?, updated_at = ?
         WHERE owner_member_id = ? AND application_status IN ('approved','revision_requested') AND length(description) >= 10`,
      ).bind(now, now, memberId).run();
      if (!Number(changed.meta.changes ?? 0)) return jsonError("채널 기본정보를 저장한 뒤 공개 검수를 요청해 주세요.", 409);
    } else if (payload.action === "profile.update") {
      const name = String(payload.name ?? "").trim();
      const phone = String(payload.phone ?? "").trim();
      if (name.length < 2) return jsonError("이름을 두 글자 이상 입력해 주세요.");
      await db
        .prepare("UPDATE members SET name = ?, phone = ? WHERE id = ?")
        .bind(name, phone, memberId)
        .run();
    } else {
      return jsonError("지원하지 않는 요청입니다.");
    }

    const refreshed = await db
      .prepare("SELECT * FROM members WHERE id = ?")
      .bind(memberId)
      .first<Record<string, unknown>>();
    if (["address.save", "address.default", "address.delete"].includes(String(payload.action))) {
      const addresses = await db.prepare(
        `SELECT * FROM shipping_addresses WHERE member_id = ?
         ORDER BY is_default DESC, CASE WHEN last_used_at IS NULL THEN 1 ELSE 0 END,
                  last_used_at DESC, updated_at DESC, id DESC`,
      ).bind(memberId).all();
      return storeResponse({ partial: "addresses", addresses: addresses.results }, nativeSession, request);
    }
    if (payload.action === "profile.update") {
      return storeResponse({ partial: "profile", member: refreshed ?? member }, nativeSession, request);
    }
    if (String(payload.action).startsWith("channel.")) {
      const memberChannel = await db.prepare(`SELECT c.*,
        (SELECT GROUP_CONCAT(cp.product_id) FROM sales_channel_products cp WHERE cp.channel_id = c.id) AS product_ids,
        (SELECT COUNT(*) FROM sales_channel_products cp WHERE cp.channel_id = c.id) AS product_count
        FROM sales_channels c WHERE c.owner_member_id = ? LIMIT 1`).bind(memberId).first();
      return storeResponse({ partial: "memberChannel", memberChannel }, nativeSession, request);
    }
    if (payload.action === "inquiry.create") {
      const inquiries = await db.prepare("SELECT * FROM inquiries WHERE member_id = ? ORDER BY id DESC LIMIT 30").bind(memberId).all();
      return storeResponse({ partial: "inquiries", inquiries: inquiries.results }, nativeSession, request);
    }
    if (payload.action === "finance.create") {
      const finance = await db.prepare("SELECT * FROM finance_requests WHERE member_id = ? ORDER BY id DESC LIMIT 30").bind(memberId).all();
      return storeResponse({ partial: "finance", finance: finance.results }, nativeSession, request);
    }
    if (payload.action === "cart.update") {
      const cart = await db.prepare(
        `SELECT c.id, c.quantity, c.selected_options, c.channel_id, c.channel_name,
                p.id AS product_id, p.name, p.image_url, p.point_price, p.stock, p.status, p.category, p.variants_json,
                p.point_usage_mode, p.point_max_percent, p.cash_payment_enabled
         FROM carts c JOIN products p ON p.id = c.product_id
         WHERE c.member_id = ? ORDER BY c.id DESC`,
      ).bind(memberId).all();
      const variantEnabled = (await db.prepare("SELECT value FROM settings WHERE key = 'feature_variant_stock_enabled'").first<{ value: string }>())?.value === "true";
      return storeResponse({
        partial: "cart.update",
        cart: cart.results.map((row) => {
          const variant = variantEnabled ? matchingVariant(row.variants_json, String(row.selected_options)) : null;
          return { ...row, point_price: Number(row.point_price) + Number(variant?.additionalPrice || 0), stock: variant ? Number(variant.stock) : Number(row.stock), variant_sku: variant?.sku || "" };
        }),
      }, nativeSession, request);
    }
    return storeResponse(
      await getStorePayload(
        refreshed ?? member,
        "native",
        new URL(request.url).origin,
      ),
      nativeSession,
      request,
    );
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "요청 처리에 실패했습니다.", 500);
  }
}

async function storeResponse(
  payload: unknown,
  session: NativeMemberSession | null,
  request: Request,
) {
  const response = Response.json(payload, {
    headers: {
      "cache-control": "private, no-store, max-age=0, must-revalidate",
      pragma: "no-cache",
      expires: "0",
      vary: "Cookie",
    },
  });
  if (session) {
    const cookies = await renewMemberSessionIfNeeded(session, request);
    for (const cookie of cookies) response.headers.append("set-cookie", cookie);
  }
  return response;
}
