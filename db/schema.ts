import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const members = sqliteTable("members", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  role: text("role").notNull().default("member"),
  status: text("status").notNull().default("active"),
  points: integer("points").notNull().default(0),
  chargePoints: integer("charge_points").notNull().default(0),
  rewardPoints: integer("reward_points").notNull().default(0),
  pendingRewardPoints: integer("pending_reward_points").notNull().default(0),
  emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
  phoneVerified: integer("phone_verified", { mode: "boolean" }).notNull().default(false),
  phone: text("phone").notNull().default(""),
  joinedAt: text("joined_at").notNull(),
});

export const memberCredentials = sqliteTable("member_credentials", {
  memberId: integer("member_id").primaryKey(),
  passwordHash: text("password_hash").notNull(),
  failedAttempts: integer("failed_attempts").notNull().default(0),
  lockedUntil: text("locked_until"),
  updatedAt: text("updated_at").notNull(),
});

export const memberIdentities = sqliteTable(
  "member_identities",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    memberId: integer("member_id").notNull(),
    provider: text("provider").notNull(),
    providerSubject: text("provider_subject").notNull(),
    providerEmail: text("provider_email").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("member_identities_member_idx").on(table.memberId),
    uniqueIndex("member_identities_provider_unique").on(
      table.provider,
      table.providerSubject,
    ),
  ],
);

export const memberSessions = sqliteTable(
  "member_sessions",
  {
    sessionHash: text("session_hash").primaryKey(),
    memberId: integer("member_id").notNull(),
    expiresAt: text("expires_at").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("member_sessions_member_idx").on(table.memberId),
    index("member_sessions_expires_idx").on(table.expiresAt),
  ],
);

export const passwordResetRequests = sqliteTable("password_reset_requests", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  memberId: integer("member_id").notNull(),
  status: text("status").notNull().default("pending"),
  requestedAt: text("requested_at").notNull(),
  completedAt: text("completed_at"),
});

export const testDataMembers = sqliteTable("test_data_members", {
  memberId: integer("member_id").primaryKey(),
  scenario: text("scenario").notNull(),
  createdAt: text("created_at").notNull(),
});

export const products = sqliteTable("products", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  category: text("category").notNull(),
  brand: text("brand").notNull().default(""),
  productCode: text("product_code").notNull().default(""),
  styleNumber: text("style_number").notNull().default(""),
  description: text("description").notNull(),
  imageUrl: text("image_url").notNull(),
  imageUrls: text("image_urls").notNull().default("[]"),
  mediaJson: text("media_json").notNull().default("[]"),
  optionsJson: text("options_json").notNull().default("[]"),
  variantsJson: text("variants_json").notNull().default("[]"),
  detailContent: text("detail_content").notNull().default(""),
  shippingInfo: text("shipping_info").notNull().default(""),
  pointPrice: integer("point_price").notNull(),
  pointUsageMode: text("point_usage_mode").notNull().default("full"),
  pointMaxPercent: integer("point_max_percent").notNull().default(100),
  cashPaymentEnabled: integer("cash_payment_enabled", { mode: "boolean" }).notNull().default(true),
  rewardOnCashOnly: integer("reward_on_cash_only", { mode: "boolean" }).notNull().default(true),
  stock: integer("stock").notNull().default(0),
  status: text("status").notNull().default("active"),
  badge: text("badge").notNull().default(""),
  salesCount: integer("sales_count").notNull().default(0),
  createdAt: text("created_at").notNull(),
}, (table) => [
  uniqueIndex("products_style_number_unique")
    .on(table.styleNumber)
    .where(sql`${table.styleNumber} != '' AND ${table.status} != 'deleted'`),
  index("products_status_sales_idx").on(table.status, table.salesCount, table.id),
  index("products_status_category_idx").on(table.status, table.category, table.id),
]);

export const salesChannels = sqliteTable("sales_channels", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  operatorName: text("operator_name").notNull().default(""),
  description: text("description").notNull().default(""),
  imageUrl: text("image_url").notNull().default(""),
  avatarImageUrl: text("avatar_image_url").notNull().default(""),
  originalImageUrl: text("original_image_url").notNull().default(""),
  youtubeUrl: text("youtube_url").notNull().default(""),
  broadcastSettings: text("broadcast_settings").notNull().default("{}"),
  categorySettings: text("category_settings").notNull().default("[]"),
  contactSettings: text("contact_settings").notNull().default("{}"),
  ownerMemberId: integer("owner_member_id"),
  applicationStatus: text("application_status").notNull().default("admin_created"),
  applicationMessage: text("application_message").notNull().default(""),
  adminReviewNote: text("admin_review_note").notNull().default(""),
  appliedAt: text("applied_at"),
  approvedAt: text("approved_at"),
  publicationRequestedAt: text("publication_requested_at"),
  publishedAt: text("published_at"),
  viewCount: integer("view_count").notNull().default(0),
  themeColor: text("theme_color").notNull().default("#111827"),
  status: text("status").notNull().default("draft"),
  sortOrder: integer("sort_order").notNull().default(0),
  showcaseVisible: integer("showcase_visible", { mode: "boolean" }).notNull().default(true),
  showcaseOrder: integer("showcase_order").notNull().default(0),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  index("sales_channels_status_sort_idx").on(table.status, table.sortOrder),
  index("sales_channels_showcase_idx").on(table.showcaseVisible, table.showcaseOrder),
  uniqueIndex("sales_channels_owner_member_unique").on(table.ownerMemberId),
  index("sales_channels_application_status_idx").on(table.applicationStatus, table.updatedAt),
]);

export const salesChannelProducts = sqliteTable("sales_channel_products", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  channelId: integer("channel_id").notNull(),
  productId: integer("product_id").notNull(),
  featured: integer("featured", { mode: "boolean" }).notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: text("created_at").notNull(),
}, (table) => [
  uniqueIndex("sales_channel_products_unique").on(table.channelId, table.productId),
  index("sales_channel_products_channel_sort_idx").on(table.channelId, table.sortOrder),
  index("sales_channel_products_product_idx").on(table.productId),
]);

// 상품별 확장 정보는 기존에 등록된 상품을 위해 계속 유지한다.
export const productCatalogDetails = sqliteTable(
  "product_catalog_details",
  {
    productId: integer("product_id").primaryKey(),
    nameEn: text("name_en").notNull().default(""),
    subcategory: text("subcategory").notNull().default(""),
    productType: text("product_type").notNull().default("accessories"),
    salePrice: integer("sale_price").notNull().default(0),
    pointsPrice: integer("points_price").notNull().default(0),
    featured: integer("featured", { mode: "boolean" }).notNull().default(false),
    typeFieldsJson: text("type_fields_json").notNull().default("{}"),
    searchSourcesJson: text("search_sources_json").notNull().default("[]"),
    thumbnailUrl: text("thumbnail_url").notNull().default(""),
    sourceKind: text("source_kind").notNull().default("manual"),
    sourceReference: text("source_reference").notNull().default(""),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [index("product_catalog_details_type_idx").on(table.productType, table.productId)],
);

export const carts = sqliteTable("carts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  memberId: integer("member_id").notNull(),
  productId: integer("product_id").notNull(),
  selectedOptions: text("selected_options").notNull().default("{}"),
  quantity: integer("quantity").notNull().default(1),
  channelId: integer("channel_id"),
  channelName: text("channel_name").notNull().default(""),
  createdAt: text("created_at").notNull(),
});

export const wishlists = sqliteTable("wishlists", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  memberId: integer("member_id").notNull(),
  productId: integer("product_id").notNull(),
  createdAt: text("created_at").notNull(),
});

export const shippingAddresses = sqliteTable(
  "shipping_addresses",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    memberId: integer("member_id").notNull(),
    label: text("label").notNull().default("배송지"),
    recipient: text("recipient").notNull(),
    phone: text("phone").notNull(),
    postalCode: text("postal_code").notNull().default(""),
    address1: text("address1").notNull(),
    addressDetail: text("address_detail").notNull().default(""),
    deliveryRequest: text("delivery_request").notNull().default(""),
    customsCodeEncrypted: text("customs_code_encrypted").notNull().default(""),
    customsCodeMasked: text("customs_code_masked").notNull().default(""),
    customsVerifiedAt: text("customs_verified_at"),
    customsExpiresAt: text("customs_expires_at"),
    customsSaveConsentAt: text("customs_save_consent_at"),
    isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
    lastUsedAt: text("last_used_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("shipping_addresses_member_idx").on(table.memberId),
    index("shipping_addresses_member_default_idx").on(
      table.memberId,
      table.isDefault,
    ),
  ],
);

export const orders = sqliteTable("orders", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  orderNo: text("order_no").notNull().unique(),
  idempotencyKey: text("idempotency_key"),
  memberId: integer("member_id").notNull(),
  channelId: integer("channel_id"),
  channelName: text("channel_name").notNull().default(""),
  totalPoints: integer("total_points").notNull(),
  usedChargePoints: integer("used_charge_points").notNull().default(0),
  usedRewardPoints: integer("used_reward_points").notNull().default(0),
  paymentMethod: text("payment_method").notNull().default("points"),
  cashPaymentChannel: text("cash_payment_channel").notNull().default(""),
  paymentStatus: text("payment_status").notNull().default("paid"),
  cashAmount: integer("cash_amount").notNull().default(0),
  purchaseRewardPoints: integer("purchase_reward_points").notNull().default(0),
  purchaseRewardStatus: text("purchase_reward_status").notNull().default("none"),
  pointReservationStatus: text("point_reservation_status").notNull().default("captured"),
  paymentExpiresAt: text("payment_expires_at"),
  paymentConfirmedAt: text("payment_confirmed_at"),
  status: text("status").notNull().default("접수"),
  recipient: text("recipient").notNull(),
  phone: text("phone").notNull(),
  address: text("address").notNull(),
  memo: text("memo").notNull().default(""),
  postalCode: text("postal_code").notNull().default(""),
  address1: text("address1").notNull().default(""),
  addressDetail: text("address_detail").notNull().default(""),
  addressUpdatedAt: text("address_updated_at"),
  courier: text("courier").notNull().default(""),
  trackingNo: text("tracking_no").notNull().default(""),
  shippedAt: text("shipped_at"),
  deliveredAt: text("delivered_at"),
  deliveryStage: text("delivery_stage").notNull().default("payment_confirmed"),
  internationalTrackingNo: text("international_tracking_no").notNull().default(""),
  customsStatus: text("customs_status").notNull().default("waiting"),
  customsCodeEncrypted: text("customs_code_encrypted").notNull().default(""),
  customsCodeMasked: text("customs_code_masked").notNull().default(""),
  customsVerifiedAt: text("customs_verified_at"),
  customsExpiresAt: text("customs_expires_at"),
  subtotalPoints: integer("subtotal_points").notNull().default(0),
  shippingFee: integer("shipping_fee").notNull().default(0),
  discountAmount: integer("discount_amount").notNull().default(0),
  couponId: integer("coupon_id"),
  benefitSnapshot: text("benefit_snapshot").notNull().default("{}"),
  createdAt: text("created_at").notNull(),
}, (table) => [uniqueIndex("orders_member_idempotency_idx").on(table.memberId, table.idempotencyKey).where(sql`${table.idempotencyKey} IS NOT NULL AND ${table.idempotencyKey} != ''`)]);

export const orderItems = sqliteTable("order_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  orderId: integer("order_id").notNull(),
  productId: integer("product_id").notNull(),
  productName: text("product_name").notNull(),
  pointPrice: integer("point_price").notNull(),
  selectedOptions: text("selected_options").notNull().default("{}"),
  quantity: integer("quantity").notNull(),
  channelId: integer("channel_id"),
  channelName: text("channel_name").notNull().default(""),
});

export const orderClaims = sqliteTable("order_claims", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  orderId: integer("order_id").notNull(),
  memberId: integer("member_id").notNull(),
  claimType: text("claim_type").notNull(),
  reasonType: text("reason_type").notNull(),
  reasonDetail: text("reason_detail").notNull().default(""),
  evidenceJson: text("evidence_json").notNull().default("[]"),
  costBearer: text("cost_bearer").notNull().default("review"),
  returnFee: integer("return_fee").notNull().default(0),
  status: text("status").notNull().default("requested"),
  adminNote: text("admin_note").notNull().default(""),
  requestedAt: text("requested_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  completedAt: text("completed_at"),
}, (table) => [
  index("order_claims_member_idx").on(table.memberId, table.requestedAt),
  index("order_claims_order_idx").on(table.orderId, table.status),
]);

export const pointLogs = sqliteTable("point_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  memberId: integer("member_id").notNull(),
  amount: integer("amount").notNull(),
  type: text("type").notNull(),
  memo: text("memo").notNull(),
  balanceAfter: integer("balance_after").notNull(),
  createdAt: text("created_at").notNull(),
  pointBucket: text("point_bucket").notNull().default("charge"),
  rewardEventId: integer("reward_event_id"),
});

export const referralCodes = sqliteTable("referral_codes", {
  memberId: integer("member_id").primaryKey(),
  code: text("code").notNull().unique(),
  createdAt: text("created_at").notNull(),
});

export const referralVisits = sqliteTable("referral_visits", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  referralCode: text("referral_code").notNull(),
  visitorToken: text("visitor_token").notNull(),
  landingPath: text("landing_path").notNull().default("/"),
  createdAt: text("created_at").notNull(),
  expiresAt: text("expires_at").notNull(),
}, (table) => [index("referral_visits_code_idx").on(table.referralCode, table.createdAt)]);

export const referrals = sqliteTable("referrals", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  inviterId: integer("inviter_id").notNull(),
  inviteeId: integer("invitee_id").notNull().unique(),
  referralCode: text("referral_code").notNull(),
  status: text("status").notNull().default("가입완료"),
  joinedAt: text("joined_at").notNull(),
  verifiedAt: text("verified_at"),
  firstOrderId: integer("first_order_id"),
  eligibleAt: text("eligible_at"),
  confirmedAt: text("confirmed_at"),
  canceledAt: text("canceled_at"),
  holdReason: text("hold_reason").notNull().default(""),
  policyJson: text("policy_json").notNull().default("{}"),
}, (table) => [index("referrals_inviter_idx").on(table.inviterId, table.joinedAt)]);

export const rewardEvents = sqliteTable("reward_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  memberId: integer("member_id").notNull(),
  referralId: integer("referral_id"),
  orderId: integer("order_id"),
  sourceType: text("source_type").notNull(),
  beneficiaryRole: text("beneficiary_role").notNull().default("member"),
  amount: integer("amount").notNull(),
  status: text("status").notNull().default("pending"),
  availableAt: text("available_at"),
  expiresAt: text("expires_at"),
  memo: text("memo").notNull(),
  policyJson: text("policy_json").notNull().default("{}"),
  createdAt: text("created_at").notNull(),
  confirmedAt: text("confirmed_at"),
  revokedAt: text("revoked_at"),
}, (table) => [
  index("reward_events_member_idx").on(table.memberId, table.status, table.createdAt),
  uniqueIndex("reward_events_unique_source").on(table.memberId, table.sourceType, table.referralId, table.beneficiaryRole),
]);

export const referralFlags = sqliteTable("referral_flags", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  referralId: integer("referral_id").notNull(),
  reasons: text("reasons").notNull(),
  status: text("status").notNull().default("검토중"),
  adminNote: text("admin_note").notNull().default(""),
  createdAt: text("created_at").notNull(),
  resolvedAt: text("resolved_at"),
});

export const attendanceRecords = sqliteTable(
  "attendance_records",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    memberId: integer("member_id").notNull(),
    attendanceDate: text("attendance_date").notNull(),
    streak: integer("streak").notNull().default(1),
    basePoints: integer("base_points").notNull().default(0),
    bonusPoints: integer("bonus_points").notNull().default(0),
    totalPoints: integer("total_points").notNull().default(0),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("attendance_records_member_idx").on(table.memberId),
    uniqueIndex("attendance_records_member_date_unique").on(
      table.memberId,
      table.attendanceDate,
    ),
  ],
);

export const financeRequests = sqliteTable("finance_requests", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  memberId: integer("member_id").notNull(),
  requestType: text("request_type").notNull(),
  amount: integer("amount").notNull(),
  bankName: text("bank_name").notNull().default(""),
  accountNo: text("account_no").notNull().default(""),
  accountHolder: text("account_holder").notNull().default(""),
  status: text("status").notNull().default("대기"),
  memo: text("memo").notNull().default(""),
  createdAt: text("created_at").notNull(),
});

export const reviews = sqliteTable("reviews", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  memberId: integer("member_id").notNull(),
  productId: integer("product_id").notNull(),
  orderId: integer("order_id"),
  orderItemId: integer("order_item_id"),
  rating: integer("rating").notNull(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  imageUrls: text("image_urls").notNull().default("[]"),
  visible: integer("visible", { mode: "boolean" }).notNull().default(true),
  rewardPoints: integer("reward_points").notNull().default(0),
  rewardStatus: text("reward_status").notNull().default("지급"),
  rewardedAt: text("rewarded_at"),
  revokedAt: text("revoked_at"),
  adminReply: text("admin_reply").notNull().default(""),
  answeredAt: text("answered_at"),
  hiddenReason: text("hidden_reason").notNull().default(""),
  deletedAt: text("deleted_at"),
  updatedAt: text("updated_at"),
  createdAt: text("created_at").notNull(),
}, (table) => [
  uniqueIndex("reviews_order_item_unique").on(table.orderItemId),
  index("reviews_product_visibility_idx").on(table.productId, table.visible, table.deletedAt),
]);

export const popups = sqliteTable("popups", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  content: text("content").notNull(),
  buttonText: text("button_text").notNull().default("쇼핑 시작"),
  linkUrl: text("link_url").notNull().default("/"),
  backgroundColor: text("background_color").notNull().default("#11243e"),
  imageUrl: text("image_url").notNull().default(""),
  width: integer("width").notNull().default(420),
  height: integer("height").notNull().default(460),
  positionX: integer("position_x").notNull().default(50),
  positionY: integer("position_y").notNull().default(50),
  target: text("target").notNull().default("_self"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  startsAt: text("starts_at").notNull(),
  endsAt: text("ends_at").notNull(),
});

export const notices = sqliteTable("notices", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  content: text("content").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull(),
});

export const coupons = sqliteTable("coupons", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  pointAmount: integer("point_amount").notNull(),
  couponType: text("coupon_type").notNull().default("point"),
  discountKind: text("discount_kind").notNull().default("fixed"),
  discountValue: integer("discount_value").notNull().default(0),
  minimumOrder: integer("minimum_order").notNull().default(0),
  targetCategory: text("target_category").notNull().default("전체"),
  claimedBy: integer("claimed_by"),
  claimedAt: text("claimed_at"),
  status: text("status").notNull().default("미사용"),
  usedBy: integer("used_by"),
  usedAt: text("used_at"),
  expiresAt: text("expires_at"),
  createdAt: text("created_at").notNull(),
});

export const inquiries = sqliteTable("inquiries", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  memberId: integer("member_id").notNull(),
  productId: integer("product_id"),
  category: text("category").notNull().default("이용문의"),
  title: text("title").notNull(),
  content: text("content").notNull(),
  answer: text("answer").notNull().default(""),
  status: text("status").notNull().default("접수"),
  createdAt: text("created_at").notNull(),
  answeredAt: text("answered_at"),
});

export const auditLogs = sqliteTable("audit_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  adminName: text("admin_name").notNull(),
  action: text("action").notNull(),
  target: text("target").notNull().default(""),
  createdAt: text("created_at").notNull(),
});

export const adminAccounts = sqliteTable("admin_accounts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  username: text("username").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("manager"),
  permissions: text("permissions")
    .notNull()
    .default(JSON.stringify([
      "products",
      "members",
      "points",
      "orders",
      "finance",
      "reviews",
      "notices",
      "coupons",
      "inquiries",
      "popups",
      "audit",
    ])),
  status: text("status").notNull().default("active"),
  forcePasswordChange: integer("force_password_change", { mode: "boolean" })
    .notNull()
    .default(true),
  failedAttempts: integer("failed_attempts").notNull().default(0),
  lockedUntil: text("locked_until"),
  lastLoginAt: text("last_login_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const adminSessions = sqliteTable(
  "admin_sessions",
  {
    sessionHash: text("session_hash").primaryKey(),
    adminAccountId: integer("admin_account_id").notNull(),
    expiresAt: text("expires_at").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("admin_sessions_account_idx").on(table.adminAccountId),
    index("admin_sessions_expires_idx").on(table.expiresAt),
  ],
);
