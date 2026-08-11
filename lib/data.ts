import { getD1, isAdminEmail, nowIso, type RequestUser } from "./server";
import {
  DEFAULT_MANAGER_PERMISSIONS,
  getStaffAdminFromHeaders,
  hashAdminPassword,
  SUPERVISOR_PERMISSIONS,
  verifyAdminPassword,
  type AdminIdentity,
} from "./admin-auth";
import { ensureInitialTestData } from "./test-data";
import { parseCategoryConfig, productMatchesCategory, selectableCategoryNames } from "./category-config";
import { brandMatchesChannelRule, inferChannelBrandRuleCategory } from "./channel-category-rules";
import { ensureUserSkuDraftImport } from "./sku-draft-import";
import { PRODUCT_CATALOG_INDEX_COLUMNS, PRODUCT_LIST_COLUMNS, PRODUCT_REVIEW_JOIN } from "./catalog-query";

const defaultSettings: Record<string, string> = {
  brand_name: "POINT GARDEN",
  brand_english_name: "POINT GARDEN",
  brand_tagline: "취향을 선물하는 리워드 셀렉트숍",
  point_name: "리워드",
  point_unit: "P",
  logo_text: "PG",
  logo_url: "",
  primary_color: "#11243e",
  secondary_color: "#ff6b35",
  accent_color: "#f4c95d",
  hero_title: "쌓은 리워드를\n기분 좋은 선물로",
  hero_subtitle: "현금·리워드·혼합 결제를 선택할 수 있는 회원 리워드 쇼핑몰",
  support_phone: "1588-0000",
  support_hours: "평일 09:00–18:00",
  support_email: "help@pointgarden.kr",
  contact_floating_enabled: "true",
  contact_default_open: "true",
  contact_always_available: "false",
  contact_start_time: "09:00",
  contact_end_time: "18:00",
  contact_weekdays: "1,2,3,4,5",
  contact_counselor_image_url: "",
  contact_kakao_enabled: "true",
  contact_kakao_url: "https://www.kakao.com/",
  contact_telegram_enabled: "true",
  contact_telegram_url: "https://telegram.org/",
  contact_line_enabled: "true",
  contact_line_url: "https://line.me/",
  contact_live_enabled: "true",
  contact_live_url: "/notices",
  company_name: "포인트가든",
  business_number: "000-00-00000",
  representative_name: "관리자",
  company_address: "서울특별시",
  bank_name: "가든은행",
  bank_account: "000-0000-0000",
  bank_holder: "포인트가든",
  signup_code: "",
  seo_title: "리워드 쇼핑몰 | 포인트가든",
  seo_description: "현금·리워드·혼합 결제를 지원하고 출석·후기·추천 리워드를 제공하는 회원 쇼핑몰",
  site_url: "https://reward-point-mall-v2.qldrh1990.chatgpt.site",
  terms_text: "본 리워드 쇼핑몰은 현금·리워드·혼합 결제를 지원하는 회원 전용 서비스입니다.",
  privacy_text: "회원정보는 회원관리, 상품 배송, 고객문의 처리 목적으로만 이용합니다.",
  footer_notice: "1P는 1원이며, 무통장입금·카카오톡 송금은 관리자가 입금 확인 후 처리합니다.",
  kakao_payment_url: "",
  kakao_payment_hold_hours: "24",
  cash_reward_rate: "0",
  google_client_id: "",
  review_text_points: "300",
  review_photo_points: "500",
  review_write_days: "90",
  review_min_length: "20",
  review_max_images: "4",
  review_auto_publish: "true",
  attendance_enabled: "true",
  attendance_daily_points: "100",
  attendance_streak_days: "7",
  attendance_streak_bonus: "500",
  referral_enabled: "true",
  referral_join_reward: "500",
  referral_first_order_inviter_reward: "1000",
  referral_first_order_friend_reward: "1000",
  referral_min_order_points: "30000",
  referral_hold_days: "7",
  referral_cookie_days: "30",
  referral_monthly_cap: "30000",
  referral_reward_expiry_days: "365",
  product_categories: JSON.stringify([
    "신발", "러닝화", "스니커즈", "클로그", "샌들·슬리퍼", "부츠", "슬립온",
    "의류", "상의", "하의", "아우터",
    "가방", "백팩", "크로스백", "토트백",
    "벨트", "지갑",
  ]),
  product_category_config: JSON.stringify({
    menuLimit: 7,
    categories: [
      { id: "category-shoes", name: "신발", visible: true, children: ["러닝화", "스니커즈", "클로그", "샌들·슬리퍼", "부츠", "슬립온"].map((name, index) => ({ id: `child-shoes-${index + 1}`, name, visible: true, children: [] })) },
      { id: "category-clothing", name: "의류", visible: true, children: ["상의", "하의", "아우터"].map((name, index) => ({ id: `child-clothing-${index + 1}`, name, visible: true, children: [] })) },
      { id: "category-bags", name: "가방", visible: true, children: ["백팩", "크로스백", "토트백"].map((name, index) => ({ id: `child-bags-${index + 1}`, name, visible: true, children: [] })) },
      { id: "category-belts", name: "벨트", visible: true, children: [] },
      { id: "category-wallets", name: "지갑", visible: true, children: [] },
    ],
  }),
  product_brands: JSON.stringify(["NIKE", "ADIDAS", "ASICS", "NEW BALANCE"]),
  product_brand_groups: JSON.stringify({}),
  feature_shipping_enabled: "false",
  shipping_base_fee: "3000",
  shipping_free_threshold: "50000",
  shipping_remote_fee: "3000",
  shipping_remote_prefixes: "630,631,632,633,635,636",
  shipping_return_fee: "6000",
  shipping_exchange_fee: "6000",
  shipping_return_address: "",
  overseas_direct_enabled: "true",
  overseas_origin_country: "중국",
  overseas_seller_notice: "중국 현지 판매자가 공급·발송하며, 플랫폼이 결제·국제배송·통관 안내·고객상담·취소·반품·환불을 관리합니다.",
  overseas_delivery_min_days: "7",
  overseas_delivery_max_days: "14",
  overseas_customs_delay_notice: "현지 출고, 항공·선박 운송, 세관 검사와 국내 택배 사정에 따라 배송이 늦어질 수 있습니다.",
  overseas_tax_notice: "관세·부가세 등 수입 제세금이 발생하는 경우 주문 안내에 따라 별도로 납부할 수 있습니다.",
  overseas_customs_notice: "수취인 이름·휴대전화·개인통관고유부호가 관세청 등록정보와 일치해야 합니다. 2026년부터 개인통관고유부호는 1년마다 갱신 여부를 확인해야 합니다.",
  overseas_return_notice: "오배송·파손·하자는 플랫폼 확인 후 판매자 부담으로 처리하며, 단순 변심은 국제 반송비가 발생할 수 있습니다. 상품 수령 후 7일 이내 마이페이지에서 신청해 주세요.",
  overseas_terms_notice: "본 상품은 해외직구 상품입니다. 중국 판매자가 상품을 공급하고 플랫폼이 결제, 배송 진행, 고객상담과 환불 절차를 책임지고 관리합니다.",
  feature_home_display_enabled: "false",
  home_display_sections: JSON.stringify([
    { id: "recommended", title: "추천상품", visible: true, sort: "manual", productIds: [] },
    { id: "new", title: "신상품", visible: true, sort: "newest", productIds: [] },
    { id: "popular", title: "인기상품", visible: true, sort: "popular", productIds: [] },
  ]),
  feature_variant_stock_enabled: "false",
  feature_member_tiers_enabled: "false",
  member_tiers: JSON.stringify([
    { id: "basic", name: "일반", minSpend: 0, rewardRate: 0 },
    { id: "vip", name: "VIP", minSpend: 300000, rewardRate: 1 },
    { id: "vvip", name: "VVIP", minSpend: 1000000, rewardRate: 2 },
  ]),
  feature_discount_enabled: "false",
  period_discount_name: "",
  period_discount_rate: "0",
  period_discount_category: "전체",
  period_discount_starts_at: "",
  period_discount_ends_at: "",
  feature_templates_enabled: "false",
  template_order_received: "주문이 정상적으로 접수되었습니다.",
  template_payment_confirmed: "결제가 확인되어 상품을 준비하고 있습니다.",
  template_shipping: "상품이 발송되었습니다. 운송장 정보를 확인해 주세요.",
  template_cancelled: "주문 취소가 완료되었으며 사용한 리워드는 반환됩니다.",
  template_returned: "반품 처리가 완료되었습니다.",
  feature_statistics_enabled: "true",
  storefront_skin: "general",
  youtube_live_enabled: "false",
  youtube_live_orientation: "horizontal",
  youtube_live_title: "오늘의 유튜브 라이브 쇼핑",
  youtube_live_url: "",
  youtube_live_notice: "방송에서 소개한 상품을 사이트에서 바로 주문할 수 있습니다.",
  youtube_live_slot_count: "50",
  youtube_live_slot_numbers: JSON.stringify(Array.from({ length: 50 }, (_, index) => index + 1)),
  youtube_live_product_ids: "[]",
  youtube_live_slots: "[]",
  youtube_live_current_number: "",
  youtube_live_history: "[]",
  youtube_replays: "[]",
  youtube_shorts: "[]",
};

const channelBroadcastSettingKeys = [
  "storefront_skin", "youtube_live_enabled", "youtube_live_orientation", "youtube_live_title",
  "youtube_live_url", "youtube_live_notice", "youtube_live_slot_count", "youtube_live_slot_numbers",
  "youtube_live_product_ids", "youtube_live_slots", "youtube_live_current_number", "youtube_live_history",
  "youtube_replays", "youtube_shorts",
];

type SeedProduct = {
  name: string;
  category: string;
  brand: string;
  productCode: string;
  description: string;
  imageUrl: string;
  imageUrls: string;
  mediaJson: string;
  optionsJson: string;
  detailContent: string;
  shippingInfo: string;
  pointPrice: number;
  stock: number;
  badge: string;
};

const sampleProduct = (
  brand: string,
  category: string,
  name: string,
  description: string,
  photoIdsOrUrls: string[],
  pointPrice: number,
  stock: number,
  productCode: string,
  badge = "",
): SeedProduct => {
  const imageUrls = photoIdsOrUrls.map((entry) =>
    entry.startsWith("http")
      ? entry
      : `https://images.unsplash.com/photo-${entry}?auto=format&fit=crop&w=900&q=85`,
  );
  const sampleNotice = "이 상품은 쇼핑몰 기능 확인을 위한 샘플입니다. 상품명·가격·재고·이미지는 데모용이며 실제 판매 정보가 아닙니다.";
  const options = category === "신발"
    ? [{ name: "사이즈", values: ["230", "240", "250", "260", "270", "280", "290"] }]
    : category === "의류"
      ? [{ name: "사이즈", values: ["S", "M", "L", "XL"] }, { name: "색상", values: ["블랙", "화이트", "네이비"] }]
      : [{ name: "색상", values: ["블랙", "오프화이트", "네이비"] }];
  return {
    brand,
    category,
    name: `${name} (샘플)`,
    productCode,
    description: `${description} ${sampleNotice}`,
    imageUrl: imageUrls[0],
    imageUrls: JSON.stringify(imageUrls.slice(1)),
    mediaJson: JSON.stringify(imageUrls.map((url, index) => ({
      url,
      alt: `${brand} ${name} ${index === 0 ? "대표 샘플 이미지" : `샘플 이미지 ${index + 1}`}`,
    }))),
    optionsJson: JSON.stringify(options),
    detailContent: `<h3>${brand} ${name}</h3><p>${description}</p><p><strong>샘플 상품 안내</strong><br>${sampleNotice}</p>`,
    shippingInfo: "샘플 상품으로 실제 배송되지 않습니다. 운영 전 실제 배송·교환·반품 정책으로 교체해 주세요.",
    pointPrice,
    stock,
    badge,
  };
};

const seedProducts: SeedProduct[] = [
  sampleProduct("NIKE", "신발", "나이키 에어 포스 1 '07", "클래식한 로우컷 실루엣의 데일리 스니커즈", ["1542291026-7eec264c27ff"], 149000, 32, "DEMO-NK-AF1", "BEST"),
  sampleProduct("NIKE", "신발", "나이키 에어맥스 90", "러닝 헤리티지를 담은 라이프스타일 슈즈", ["1600185365483-26d7a4cc7519"], 169000, 28, "DEMO-NK-AM90", "HOT"),
  sampleProduct("NIKE", "신발", "나이키 페가수스 41", "일상 러닝과 가벼운 운동에 어울리는 쿠셔닝 러닝화", ["1600269452121-4f2416e55c28"], 159000, 35, "DEMO-NK-PG41", "NEW"),
  sampleProduct("NIKE", "신발", "나이키 덩크 로우", "캐주얼 코디에 어울리는 클래식 농구화 스타일", ["1525966222134-fcfa99b8ae77"], 139000, 30, "DEMO-NK-DUNK", "추천"),

  sampleProduct("ADIDAS", "신발", "아디다스 삼바 OG", "슬림한 레트로 실루엣이 돋보이는 클래식 스니커즈", ["1606107557195-0e29a4b5b4aa"], 139000, 24, "DEMO-AD-SAMBA", "BEST"),
  sampleProduct("ADIDAS", "신발", "아디다스 가젤 인도어", "빈티지 무드와 낮은 프로파일을 살린 데일리 슈즈", ["1595950653106-6c9ebd614d3a"], 149000, 26, "DEMO-AD-GAZELLE", "추천"),
  sampleProduct("ADIDAS", "신발", "아디다스 울트라부스트 5", "편안한 쿠셔닝을 강조한 데일리 러닝화", ["1608231387042-66d1773070a5"], 219000, 21, "DEMO-AD-UB5", "PREMIUM"),
  sampleProduct("ADIDAS", "신발", "아디다스 슈퍼스타", "쉘토 디자인으로 알려진 클래식 스니커즈", ["1495555961986-6d4c1ecb7be3"], 129000, 33, "DEMO-AD-STAR", "HOT"),

  sampleProduct("ASICS", "신발", "아식스 젤 카야노 31", "안정적인 러닝을 위한 구조와 쿠셔닝을 강조한 러닝화", ["1491553895911-0055eca6402d"], 199000, 29, "DEMO-AS-K31", "BEST"),
  sampleProduct("ASICS", "신발", "아식스 젤 님버스 26", "부드러운 착화감을 중심으로 구성한 장거리 러닝화", ["1549298916-b41d501d3772"], 209000, 22, "DEMO-AS-N26", "PREMIUM"),
  sampleProduct("ASICS", "신발", "아식스 젤 1130", "러닝 아카이브 감성을 살린 스포츠 라이프스타일 슈즈", ["1460353581641-37baddab0fa2"], 119000, 38, "DEMO-AS-1130", "HOT"),
  sampleProduct("ASICS", "신발", "아식스 노바블라스트 4", "탄력적인 쿠셔닝을 강조한 데일리 러닝화", ["1595341888016-a392ef81b7de"], 159000, 27, "DEMO-AS-NOVA4", "NEW"),

  sampleProduct("NEW BALANCE", "신발", "뉴발란스 530", "가볍고 스포티한 실루엣의 데일리 스니커즈", ["1539185441755-769473a23570"], 129000, 34, "DEMO-NB-530", "BEST"),
  sampleProduct("NEW BALANCE", "신발", "뉴발란스 574 코어", "편안한 착화감과 클래식 디자인을 조합한 워킹 슈즈", ["1603808033192-082d6919d3e1"], 119000, 31, "DEMO-NB-574", "추천"),
  sampleProduct("NEW BALANCE", "신발", "뉴발란스 2002R", "레트로 러닝 디자인과 쿠셔닝을 결합한 라이프스타일 슈즈", ["1552346154-21d32810aba3"], 169000, 27, "DEMO-NB-2002R", "NEW"),
  sampleProduct("NEW BALANCE", "신발", "뉴발란스 327", "날렵한 실루엣과 클래식 러닝 무드를 조합한 스니커즈", ["1560769629-975ec94e6a86"], 139000, 25, "DEMO-NB-327", "HOT"),

  sampleProduct("NIKE", "가방", "나이키 헤리티지 백팩", "노트북과 일상 소지품을 나눠 담는 데일리 백팩", ["1553062407-98eeb64c6a62"], 59000, 24, "DEMO-NK-BAG01", "NEW"),
  sampleProduct("ADIDAS", "가방", "아디다스 클래식 백팩", "운동과 통학에 편하게 활용하는 기본형 백팩", ["1581605405669-fcdf81165afa"], 49000, 29, "DEMO-AD-BAG01", "BEST"),
  sampleProduct("ASICS", "가방", "아식스 코어 짐백", "운동복과 신발을 간편하게 수납하는 스포츠 가방", ["1548036328-c9fa89d128fa"], 45000, 20, "DEMO-AS-BAG01", "추천"),
  sampleProduct("NEW BALANCE", "가방", "뉴발란스 레거시 크로스백", "필수 소지품을 가볍게 휴대하는 데일리 크로스백", ["1559563458-527698bf5295"], 55000, 22, "DEMO-NB-BAG01", "HOT"),

  sampleProduct("NIKE", "의류", "나이키 스포츠웨어 티셔츠", "부드러운 면 소재의 데일리 반팔 티셔츠", ["1521572163474-6864f9cf17ab"], 39000, 36, "DEMO-NK-WEAR01", "BEST"),
  sampleProduct("ADIDAS", "의류", "아디다스 3-스트라이프 트랙탑", "스포츠와 일상 코디에 활용하는 클래식 트랙 재킷", ["1523398002811-999ca8dec234"], 99000, 25, "DEMO-AD-WEAR01", "HOT"),
  sampleProduct("ASICS", "의류", "아식스 러닝 재킷", "가벼운 러닝과 야외 활동에 어울리는 바람막이", ["1512436991641-6745cdb1723f"], 89000, 23, "DEMO-AS-WEAR01", "NEW"),
  sampleProduct("NEW BALANCE", "의류", "뉴발란스 애슬레틱 후디", "편안한 착용감의 데일리 후드 스웨트셔츠", ["1556821840-3a63f95609a7"], 79000, 28, "DEMO-NB-WEAR01", "추천"),
];

function fashionCategorySettings(rawConfig?: string, rawLegacy?: string) {
  let legacyNames: string[] = [];
  try {
    const parsed = JSON.parse(rawLegacy || "[]");
    if (Array.isArray(parsed)) legacyNames = parsed.map(String);
  } catch {
    legacyNames = [];
  }
  const config = parseCategoryConfig(rawConfig, legacyNames);
  const targetNames = ["신발", "가방", "의류", "벨트", "지갑"];
  const targetSet = new Set(targetNames);
  const shoeAliases = new Set(["슈즈", "신발류"]);
  const childDefaults: Record<string, string[]> = {
    신발: ["러닝화", "스니커즈", "클로그", "샌들·슬리퍼", "부츠", "슬립온"],
    의류: ["상의", "하의", "아우터"],
    가방: ["백팩", "크로스백", "토트백"],
    벨트: [],
    지갑: [],
  };
  const preservedTarget = new Map<string, { id: string; name: string; visible: boolean; children: Array<{ id: string; name: string; visible: boolean }> }>();
  const currentFashion = config.categories.find((entry) => entry.name === "패션");
  const aliasedShoeChildren = config.categories
    .filter((entry) => shoeAliases.has(entry.name))
    .flatMap((entry) => entry.children);

  for (const child of currentFashion?.children || []) {
    if (targetSet.has(child.name)) preservedTarget.set(child.name, { ...child, children: [] });
  }
  for (const entry of config.categories) {
    if (targetSet.has(entry.name)) {
      preservedTarget.set(entry.name, entry);
    }
    for (const child of entry.children) {
      if (targetSet.has(child.name) && !preservedTarget.has(child.name)) preservedTarget.set(child.name, { ...child, children: [] });
    }
  }

  const categories = config.categories
    .filter((entry) => !targetSet.has(entry.name) && !shoeAliases.has(entry.name))
    .map((entry) => ({
      ...entry,
      children: entry.children.filter((child) => !targetSet.has(child.name)),
    }))
    .filter((entry) => entry.name !== "패션" || entry.children.length > 0);
  const targetCategories = targetNames.map((name, index) => {
    const preserved = preservedTarget.get(name);
    const existingChildren = preserved?.children || [];
    const candidateChildren = [
      ...existingChildren,
      ...(name === "신발" ? aliasedShoeChildren : []),
      ...childDefaults[name].map((childName, childIndex) => ({
        id: `child-${index + 1}-${childIndex + 1}`,
        name: childName,
        visible: true,
      })),
    ];
    const usedChildNames = new Set<string>();
    const children = candidateChildren.filter((child) => {
      const key = child.name.toLowerCase();
      if (!key || usedChildNames.has(key)) return false;
      usedChildNames.add(key);
      return true;
    });
    return preserved
      ? { ...preserved, children }
      : { id: `category-${index + 1}`, name, visible: true, children };
  });

  const normalized = { menuLimit: config.menuLimit, categories: [...targetCategories, ...categories] };
  return {
    config: normalized,
    names: categories.flatMap((entry) => [entry.name, ...entry.children.map((child) => child.name)]),
  };
}

let schemaReady = false;

type CatalogProductRow = {
  id: number;
  name: string;
  category: string;
  point_price: number;
};

function defaultSelectedOptions(category: string) {
  if (category === "신발") return JSON.stringify({ 사이즈: "260" });
  if (category === "의류") return JSON.stringify({ 사이즈: "M", 색상: "블랙" });
  if (category === "가방") return JSON.stringify({ 색상: "블랙" });
  return "{}";
}

function mappedProduct(products: CatalogProductRow[], index: number) {
  return products[index % products.length];
}

async function reconcileCatalogReferences(products: CatalogProductRow[], now: string) {
  if (!products.length) throw new Error("현재 상품 자료를 준비하지 못했습니다.");
  const db = getD1();

  const [cartRows, wishlistRows, orderItemRows, inquiryRows, reviewRows, settingsRows] = await Promise.all([
    db.prepare("SELECT id, member_id, quantity, created_at FROM carts ORDER BY member_id, id").all<{ id: number; member_id: number; quantity: number; created_at: string }>(),
    db.prepare("SELECT id, member_id, created_at FROM wishlists ORDER BY member_id, id").all<{ id: number; member_id: number; created_at: string }>(),
    db.prepare("SELECT id FROM order_items ORDER BY id").all<{ id: number }>(),
    db.prepare("SELECT id FROM inquiries WHERE product_id IS NOT NULL ORDER BY id").all<{ id: number }>(),
    db.prepare("SELECT id, order_item_id FROM reviews ORDER BY id").all<{ id: number; order_item_id: number | null }>(),
    db.prepare("SELECT key, value FROM settings WHERE key IN ('home_display_sections', 'youtube_replays', 'youtube_shorts')").all<{ key: string; value: string }>(),
  ]);

  await db.batch([
    db.prepare("DELETE FROM carts"),
    db.prepare("DELETE FROM wishlists"),
    ...orderItemRows.results.map((row, index) => {
      const product = mappedProduct(products, index);
      return db.prepare("UPDATE order_items SET product_id = ?, product_name = ?, selected_options = ? WHERE id = ?")
        .bind(product.id, product.name, defaultSelectedOptions(product.category), row.id);
    }),
    ...inquiryRows.results.map((row, index) => db.prepare("UPDATE inquiries SET product_id = ? WHERE id = ?")
      .bind(mappedProduct(products, index).id, row.id)),
  ]);

  const memberCartIndexes = new Map<number, number>();
  const cartStatements = cartRows.results.map((row) => {
    const index = memberCartIndexes.get(row.member_id) || 0;
    memberCartIndexes.set(row.member_id, index + 1);
    const product = mappedProduct(products, index);
    return db.prepare("INSERT INTO carts (member_id, product_id, selected_options, quantity, created_at) VALUES (?, ?, ?, ?, ?)")
      .bind(row.member_id, product.id, defaultSelectedOptions(product.category), Math.max(1, Number(row.quantity || 1)), row.created_at || now);
  });
  const memberWishlistIndexes = new Map<number, number>();
  const wishlistStatements = wishlistRows.results.map((row) => {
    const index = memberWishlistIndexes.get(row.member_id) || 0;
    memberWishlistIndexes.set(row.member_id, index + 1);
    return db.prepare("INSERT INTO wishlists (member_id, product_id, created_at) VALUES (?, ?, ?)")
      .bind(row.member_id, mappedProduct(products, index).id, row.created_at || now);
  });
  if (cartStatements.length) await db.batch(cartStatements);
  if (wishlistStatements.length) await db.batch(wishlistStatements);

  const orderItemProduct = new Map<number, number>();
  orderItemRows.results.forEach((row, index) => orderItemProduct.set(row.id, mappedProduct(products, index).id));
  if (reviewRows.results.length) {
    await db.batch(reviewRows.results.map((row, index) => db.prepare("UPDATE reviews SET product_id = ? WHERE id = ?")
      .bind(orderItemProduct.get(Number(row.order_item_id)) || mappedProduct(products, index).id, row.id)));
  }

  const currentSettings = Object.fromEntries(settingsRows.results.map((row) => [row.key, row.value]));
  let homeSections: Array<Record<string, unknown>> = [];
  let replays: Array<Record<string, unknown>> = [];
  let shorts: Array<Record<string, unknown>> = [];
  try { const parsed = JSON.parse(currentSettings.home_display_sections || "[]"); if (Array.isArray(parsed)) homeSections = parsed; } catch { homeSections = []; }
  try { const parsed = JSON.parse(currentSettings.youtube_replays || "[]"); if (Array.isArray(parsed)) replays = parsed; } catch { replays = []; }
  try { const parsed = JSON.parse(currentSettings.youtube_shorts || "[]"); if (Array.isArray(parsed)) shorts = parsed; } catch { shorts = []; }

  const shoeProducts = products.filter((product) => product.category === "신발");
  const liveProducts = shoeProducts.slice(0, 12);
  const liveProductIds = liveProducts.map((product) => product.id);
  const liveSlotNumbers = liveProducts.map((_, index) => index + 1);
  const liveSlots = liveProducts.map((product, index) => ({ number: index + 1, productId: product.id }));
  const mappedHomeSections = homeSections.map((section, sectionIndex) => ({
    ...section,
    productIds: Array.isArray(section.productIds)
      ? section.productIds.map((_, productIndex) => mappedProduct(products, sectionIndex + productIndex).id)
      : [],
  }));
  const mappedReplays = replays.map((replay, replayIndex) => ({
    ...replay,
    timeline: Array.isArray(replay.timeline)
      ? replay.timeline.map((entry, entryIndex) => ({
          ...(entry && typeof entry === "object" ? entry : {}),
          productId: mappedProduct(shoeProducts, replayIndex + entryIndex).id,
        }))
      : [],
  }));
  const mappedShorts = shorts.map((short, index) => ({
    ...short,
    productId: mappedProduct(shoeProducts, index).id,
  }));

  await db.batch([
    db.prepare("UPDATE settings SET value = ?, updated_at = ? WHERE key = 'home_display_sections'").bind(JSON.stringify(mappedHomeSections), now),
    db.prepare("UPDATE settings SET value = ?, updated_at = ? WHERE key = 'youtube_live_slot_count'").bind(String(liveProductIds.length), now),
    db.prepare("UPDATE settings SET value = ?, updated_at = ? WHERE key = 'youtube_live_slot_numbers'").bind(JSON.stringify(liveSlotNumbers), now),
    db.prepare("UPDATE settings SET value = ?, updated_at = ? WHERE key = 'youtube_live_product_ids'").bind(JSON.stringify(liveProductIds), now),
    db.prepare("UPDATE settings SET value = ?, updated_at = ? WHERE key = 'youtube_live_slots'").bind(JSON.stringify(liveSlots), now),
    db.prepare("UPDATE settings SET value = ?, updated_at = ? WHERE key = 'youtube_live_current_number'").bind(liveProductIds.length ? "1" : "", now),
    db.prepare("UPDATE settings SET value = ?, updated_at = ? WHERE key = 'youtube_live_history'").bind(JSON.stringify(liveSlotNumbers.slice(0, 4)), now),
    db.prepare("UPDATE settings SET value = ?, updated_at = ? WHERE key = 'youtube_replays'").bind(JSON.stringify(mappedReplays), now),
    db.prepare("UPDATE settings SET value = ?, updated_at = ? WHERE key = 'youtube_shorts'").bind(JSON.stringify(mappedShorts), now),
  ]);
}

async function ensureRuntimeSchema() {
  if (schemaReady) return;
  const db = getD1();
  const statements = [
    `CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS members (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      role TEXT DEFAULT 'member' NOT NULL,
      status TEXT DEFAULT 'active' NOT NULL,
      points INTEGER DEFAULT 0 NOT NULL,
      charge_points INTEGER DEFAULT 0 NOT NULL,
      reward_points INTEGER DEFAULT 0 NOT NULL,
      pending_reward_points INTEGER DEFAULT 0 NOT NULL,
      email_verified INTEGER DEFAULT 0 NOT NULL,
      phone_verified INTEGER DEFAULT 0 NOT NULL,
      phone TEXT DEFAULT '' NOT NULL,
      joined_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS member_credentials (
      member_id INTEGER PRIMARY KEY NOT NULL,
      password_hash TEXT NOT NULL,
      failed_attempts INTEGER DEFAULT 0 NOT NULL,
      locked_until TEXT,
      updated_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS member_identities (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      member_id INTEGER NOT NULL,
      provider TEXT NOT NULL,
      provider_subject TEXT NOT NULL,
      provider_email TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS member_identities_member_idx
      ON member_identities (member_id)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS member_identities_provider_unique
      ON member_identities (provider, provider_subject)`,
    `CREATE TABLE IF NOT EXISTS member_sessions (
      session_hash TEXT PRIMARY KEY NOT NULL,
      member_id INTEGER NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS member_sessions_member_idx
      ON member_sessions (member_id)`,
    `CREATE INDEX IF NOT EXISTS member_sessions_expires_idx
      ON member_sessions (expires_at)`,
    `CREATE TABLE IF NOT EXISTS password_reset_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      member_id INTEGER NOT NULL,
      status TEXT DEFAULT 'pending' NOT NULL,
      requested_at TEXT NOT NULL,
      completed_at TEXT
    )`,
    `CREATE INDEX IF NOT EXISTS password_reset_requests_member_idx
      ON password_reset_requests (member_id, status, requested_at)`,
    `CREATE TABLE IF NOT EXISTS test_data_members (
      member_id INTEGER PRIMARY KEY NOT NULL,
      scenario TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      brand TEXT DEFAULT '' NOT NULL,
      product_code TEXT DEFAULT '' NOT NULL,
      style_number TEXT DEFAULT '' NOT NULL,
      description TEXT NOT NULL,
      image_url TEXT NOT NULL,
      image_urls TEXT DEFAULT '[]' NOT NULL,
      media_json TEXT DEFAULT '[]' NOT NULL,
      options_json TEXT DEFAULT '[]' NOT NULL,
      variants_json TEXT DEFAULT '[]' NOT NULL,
      detail_content TEXT DEFAULT '' NOT NULL,
      shipping_info TEXT DEFAULT '' NOT NULL,
      point_price INTEGER NOT NULL,
      point_usage_mode TEXT DEFAULT 'full' NOT NULL,
      point_max_percent INTEGER DEFAULT 100 NOT NULL,
      cash_payment_enabled INTEGER DEFAULT 1 NOT NULL,
      reward_on_cash_only INTEGER DEFAULT 1 NOT NULL,
      stock INTEGER DEFAULT 0 NOT NULL,
      status TEXT DEFAULT 'active' NOT NULL,
      badge TEXT DEFAULT '' NOT NULL,
      sales_count INTEGER DEFAULT 0 NOT NULL,
      created_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS sales_channels (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      operator_name TEXT DEFAULT '' NOT NULL,
      description TEXT DEFAULT '' NOT NULL,
      image_url TEXT DEFAULT '' NOT NULL,
      avatar_image_url TEXT DEFAULT '' NOT NULL,
      original_image_url TEXT DEFAULT '' NOT NULL,
      youtube_url TEXT DEFAULT '' NOT NULL,
      broadcast_settings TEXT DEFAULT '{}' NOT NULL,
      category_settings TEXT DEFAULT '[]' NOT NULL,
      contact_settings TEXT DEFAULT '{}' NOT NULL,
      owner_member_id INTEGER,
      application_status TEXT DEFAULT 'admin_created' NOT NULL,
      application_message TEXT DEFAULT '' NOT NULL,
      admin_review_note TEXT DEFAULT '' NOT NULL,
      applied_at TEXT,
      approved_at TEXT,
      publication_requested_at TEXT,
      published_at TEXT,
      view_count INTEGER DEFAULT 0 NOT NULL,
      theme_color TEXT DEFAULT '#111827' NOT NULL,
      status TEXT DEFAULT 'draft' NOT NULL,
      sort_order INTEGER DEFAULT 0 NOT NULL,
      showcase_visible INTEGER DEFAULT 1 NOT NULL,
      showcase_order INTEGER DEFAULT 0 NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS sales_channels_status_sort_idx
      ON sales_channels (status, sort_order)`,
    `CREATE TABLE IF NOT EXISTS sales_channel_products (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      channel_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      featured INTEGER DEFAULT 0 NOT NULL,
      sort_order INTEGER DEFAULT 0 NOT NULL,
      created_at TEXT NOT NULL
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS sales_channel_products_unique
      ON sales_channel_products (channel_id, product_id)`,
    `CREATE INDEX IF NOT EXISTS sales_channel_products_channel_sort_idx
      ON sales_channel_products (channel_id, sort_order)`,
    `CREATE INDEX IF NOT EXISTS sales_channel_products_product_idx
      ON sales_channel_products (product_id)`,
    `CREATE TABLE IF NOT EXISTS product_catalog_details (
      product_id INTEGER PRIMARY KEY NOT NULL,
      name_en TEXT DEFAULT '' NOT NULL,
      subcategory TEXT DEFAULT '' NOT NULL,
      product_type TEXT DEFAULT 'accessories' NOT NULL,
      sale_price INTEGER DEFAULT 0 NOT NULL,
      points_price INTEGER DEFAULT 0 NOT NULL,
      featured INTEGER DEFAULT 0 NOT NULL,
      type_fields_json TEXT DEFAULT '{}' NOT NULL,
      search_sources_json TEXT DEFAULT '[]' NOT NULL,
      thumbnail_url TEXT DEFAULT '' NOT NULL,
      source_kind TEXT DEFAULT 'manual' NOT NULL,
      source_reference TEXT DEFAULT '' NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS product_catalog_details_type_idx
      ON product_catalog_details (product_type, product_id)`,
    `CREATE TABLE IF NOT EXISTS carts (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      member_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      selected_options TEXT DEFAULT '{}' NOT NULL,
      quantity INTEGER DEFAULT 1 NOT NULL,
      channel_id INTEGER,
      channel_name TEXT DEFAULT '' NOT NULL,
      created_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS wishlists (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      member_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      created_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS shipping_addresses (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      member_id INTEGER NOT NULL,
      label TEXT DEFAULT '배송지' NOT NULL,
      recipient TEXT NOT NULL,
      phone TEXT NOT NULL,
      postal_code TEXT DEFAULT '' NOT NULL,
      address1 TEXT NOT NULL,
      address_detail TEXT DEFAULT '' NOT NULL,
      delivery_request TEXT DEFAULT '' NOT NULL,
      customs_code_encrypted TEXT DEFAULT '' NOT NULL,
      customs_code_masked TEXT DEFAULT '' NOT NULL,
      customs_verified_at TEXT,
      customs_expires_at TEXT,
      customs_save_consent_at TEXT,
      is_default INTEGER DEFAULT 0 NOT NULL,
      last_used_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS shipping_addresses_member_idx
      ON shipping_addresses (member_id)`,
    `CREATE INDEX IF NOT EXISTS shipping_addresses_member_default_idx
      ON shipping_addresses (member_id, is_default)`,
    `CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      order_no TEXT NOT NULL UNIQUE,
      idempotency_key TEXT,
      member_id INTEGER NOT NULL,
      channel_id INTEGER,
      channel_name TEXT DEFAULT '' NOT NULL,
      total_points INTEGER NOT NULL,
      used_charge_points INTEGER DEFAULT 0 NOT NULL,
      used_reward_points INTEGER DEFAULT 0 NOT NULL,
      payment_method TEXT DEFAULT 'points' NOT NULL,
      cash_payment_channel TEXT DEFAULT '' NOT NULL,
      payment_status TEXT DEFAULT 'paid' NOT NULL,
      cash_amount INTEGER DEFAULT 0 NOT NULL,
      purchase_reward_points INTEGER DEFAULT 0 NOT NULL,
      purchase_reward_status TEXT DEFAULT 'none' NOT NULL,
      point_reservation_status TEXT DEFAULT 'captured' NOT NULL,
      payment_expires_at TEXT,
      payment_confirmed_at TEXT,
      status TEXT DEFAULT '접수' NOT NULL,
      recipient TEXT NOT NULL,
      phone TEXT NOT NULL,
      address TEXT NOT NULL,
      memo TEXT DEFAULT '' NOT NULL,
      postal_code TEXT DEFAULT '' NOT NULL,
      address1 TEXT DEFAULT '' NOT NULL,
      address_detail TEXT DEFAULT '' NOT NULL,
      address_updated_at TEXT,
      courier TEXT DEFAULT '' NOT NULL,
      tracking_no TEXT DEFAULT '' NOT NULL,
      shipped_at TEXT,
      delivered_at TEXT,
      delivery_stage TEXT DEFAULT 'payment_confirmed' NOT NULL,
      international_tracking_no TEXT DEFAULT '' NOT NULL,
      customs_status TEXT DEFAULT 'waiting' NOT NULL,
      customs_code_encrypted TEXT DEFAULT '' NOT NULL,
      customs_code_masked TEXT DEFAULT '' NOT NULL,
      customs_verified_at TEXT,
      customs_expires_at TEXT,
      subtotal_points INTEGER DEFAULT 0 NOT NULL,
      shipping_fee INTEGER DEFAULT 0 NOT NULL,
      discount_amount INTEGER DEFAULT 0 NOT NULL,
      coupon_id INTEGER,
      benefit_snapshot TEXT DEFAULT '{}' NOT NULL,
      created_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS order_claims (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      member_id INTEGER NOT NULL,
      claim_type TEXT NOT NULL,
      reason_type TEXT NOT NULL,
      reason_detail TEXT DEFAULT '' NOT NULL,
      evidence_json TEXT DEFAULT '[]' NOT NULL,
      cost_bearer TEXT DEFAULT 'review' NOT NULL,
      return_fee INTEGER DEFAULT 0 NOT NULL,
      status TEXT DEFAULT 'requested' NOT NULL,
      admin_note TEXT DEFAULT '' NOT NULL,
      requested_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT
    )`,
    `CREATE INDEX IF NOT EXISTS order_claims_member_idx ON order_claims (member_id, requested_at)`,
    `CREATE INDEX IF NOT EXISTS order_claims_order_idx ON order_claims (order_id, status)`,
    `CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      order_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      product_name TEXT NOT NULL,
      point_price INTEGER NOT NULL,
      selected_options TEXT DEFAULT '{}' NOT NULL,
      quantity INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS point_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      member_id INTEGER NOT NULL,
      amount INTEGER NOT NULL,
      type TEXT NOT NULL,
      memo TEXT NOT NULL,
      balance_after INTEGER NOT NULL,
      created_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS referral_codes (
      member_id INTEGER PRIMARY KEY NOT NULL,
      code TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS referral_visits (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      referral_code TEXT NOT NULL,
      visitor_token TEXT NOT NULL,
      landing_path TEXT DEFAULT '/' NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS referral_visits_code_idx
      ON referral_visits (referral_code, created_at)`,
    `CREATE TABLE IF NOT EXISTS referrals (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      inviter_id INTEGER NOT NULL,
      invitee_id INTEGER NOT NULL UNIQUE,
      referral_code TEXT NOT NULL,
      status TEXT DEFAULT '가입완료' NOT NULL,
      joined_at TEXT NOT NULL,
      verified_at TEXT,
      first_order_id INTEGER,
      eligible_at TEXT,
      confirmed_at TEXT,
      canceled_at TEXT,
      hold_reason TEXT DEFAULT '' NOT NULL,
      policy_json TEXT DEFAULT '{}' NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS referrals_inviter_idx
      ON referrals (inviter_id, joined_at)`,
    `CREATE TABLE IF NOT EXISTS reward_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      member_id INTEGER NOT NULL,
      referral_id INTEGER,
      order_id INTEGER,
      source_type TEXT NOT NULL,
      beneficiary_role TEXT DEFAULT 'member' NOT NULL,
      amount INTEGER NOT NULL,
      status TEXT DEFAULT 'pending' NOT NULL,
      available_at TEXT,
      expires_at TEXT,
      memo TEXT NOT NULL,
      policy_json TEXT DEFAULT '{}' NOT NULL,
      created_at TEXT NOT NULL,
      confirmed_at TEXT,
      revoked_at TEXT
    )`,
    `CREATE INDEX IF NOT EXISTS reward_events_member_idx
      ON reward_events (member_id, status, created_at)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS reward_events_unique_source
      ON reward_events (member_id, source_type, referral_id, beneficiary_role)`,
    `CREATE TABLE IF NOT EXISTS referral_flags (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      referral_id INTEGER NOT NULL,
      reasons TEXT NOT NULL,
      status TEXT DEFAULT '검토중' NOT NULL,
      admin_note TEXT DEFAULT '' NOT NULL,
      created_at TEXT NOT NULL,
      resolved_at TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS attendance_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      member_id INTEGER NOT NULL,
      attendance_date TEXT NOT NULL,
      streak INTEGER DEFAULT 1 NOT NULL,
      base_points INTEGER DEFAULT 0 NOT NULL,
      bonus_points INTEGER DEFAULT 0 NOT NULL,
      total_points INTEGER DEFAULT 0 NOT NULL,
      created_at TEXT NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS attendance_records_member_idx
      ON attendance_records (member_id)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS attendance_records_member_date_unique
      ON attendance_records (member_id, attendance_date)`,
    `CREATE TABLE IF NOT EXISTS finance_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      member_id INTEGER NOT NULL,
      request_type TEXT NOT NULL,
      amount INTEGER NOT NULL,
      bank_name TEXT DEFAULT '' NOT NULL,
      account_no TEXT DEFAULT '' NOT NULL,
      account_holder TEXT DEFAULT '' NOT NULL,
      status TEXT DEFAULT '대기' NOT NULL,
      memo TEXT DEFAULT '' NOT NULL,
      created_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      member_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      order_id INTEGER,
      order_item_id INTEGER,
      rating INTEGER NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      image_urls TEXT DEFAULT '[]' NOT NULL,
      visible INTEGER DEFAULT 1 NOT NULL,
      reward_points INTEGER DEFAULT 0 NOT NULL,
      reward_status TEXT DEFAULT '지급' NOT NULL,
      rewarded_at TEXT,
      revoked_at TEXT,
      admin_reply TEXT DEFAULT '' NOT NULL,
      answered_at TEXT,
      hidden_reason TEXT DEFAULT '' NOT NULL,
      deleted_at TEXT,
      updated_at TEXT,
      created_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS popups (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      button_text TEXT DEFAULT '쇼핑 시작' NOT NULL,
      link_url TEXT DEFAULT '/' NOT NULL,
      background_color TEXT DEFAULT '#11243e' NOT NULL,
      image_url TEXT DEFAULT '' NOT NULL,
      width INTEGER DEFAULT 420 NOT NULL,
      height INTEGER DEFAULT 460 NOT NULL,
      position_x INTEGER DEFAULT 50 NOT NULL,
      position_y INTEGER DEFAULT 50 NOT NULL,
      target TEXT DEFAULT '_self' NOT NULL,
      active INTEGER DEFAULT 1 NOT NULL,
      starts_at TEXT NOT NULL,
      ends_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS notices (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      active INTEGER DEFAULT 1 NOT NULL,
      created_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS coupons (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      point_amount INTEGER NOT NULL,
      coupon_type TEXT DEFAULT 'point' NOT NULL,
      discount_kind TEXT DEFAULT 'fixed' NOT NULL,
      discount_value INTEGER DEFAULT 0 NOT NULL,
      minimum_order INTEGER DEFAULT 0 NOT NULL,
      target_category TEXT DEFAULT '전체' NOT NULL,
      claimed_by INTEGER,
      claimed_at TEXT,
      status TEXT DEFAULT '미사용' NOT NULL,
      used_by INTEGER,
      used_at TEXT,
      expires_at TEXT,
      created_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS inquiries (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      member_id INTEGER NOT NULL,
      product_id INTEGER,
      category TEXT DEFAULT '이용문의' NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      answer TEXT DEFAULT '' NOT NULL,
      status TEXT DEFAULT '접수' NOT NULL,
      created_at TEXT NOT NULL,
      answered_at TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      admin_name TEXT NOT NULL,
      action TEXT NOT NULL,
      target TEXT DEFAULT '' NOT NULL,
      created_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS admin_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      username TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'manager' NOT NULL,
      permissions TEXT DEFAULT '${JSON.stringify(DEFAULT_MANAGER_PERMISSIONS)}' NOT NULL,
      status TEXT DEFAULT 'active' NOT NULL,
      force_password_change INTEGER DEFAULT 1 NOT NULL,
      failed_attempts INTEGER DEFAULT 0 NOT NULL,
      locked_until TEXT,
      last_login_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS admin_sessions (
      session_hash TEXT PRIMARY KEY NOT NULL,
      admin_account_id INTEGER NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS admin_sessions_account_idx
      ON admin_sessions (admin_account_id)`,
    `CREATE INDEX IF NOT EXISTS admin_sessions_expires_idx
      ON admin_sessions (expires_at)`,
  ];
  for (const sql of statements) {
    await db.prepare(sql).run();
  }
  const memberColumns = await db.prepare("PRAGMA table_info(members)").all();
  const existingMemberColumns = new Set(
    memberColumns.results.map((row) => String(row.name)),
  );
  const missingMemberColumns = [
    ["charge_points", "INTEGER DEFAULT 0 NOT NULL"],
    ["reward_points", "INTEGER DEFAULT 0 NOT NULL"],
    ["pending_reward_points", "INTEGER DEFAULT 0 NOT NULL"],
    ["email_verified", "INTEGER DEFAULT 0 NOT NULL"],
    ["phone_verified", "INTEGER DEFAULT 0 NOT NULL"],
  ].filter(([column]) => !existingMemberColumns.has(column));
  for (const [column, definition] of missingMemberColumns) {
    await db.prepare(`ALTER TABLE members ADD COLUMN ${column} ${definition}`).run();
  }
  if (missingMemberColumns.some(([column]) => column === "charge_points")) {
    await db
      .prepare(
        `UPDATE members
         SET charge_points = points
         WHERE charge_points = 0 AND reward_points = 0 AND points > 0`,
      )
      .run();
  }
  // 포인트 통 분리 이전부터 보유하던 잔액은 총 포인트에는 남아 있지만
  // charge/reward 통에는 없을 수 있다. 현금 환급이 불가능한 기존 잔액으로
  // 안전하게 보존하기 위해 그 차액을 리워드포인트로 귀속한다.
  await db
    .prepare(
      `UPDATE members
       SET reward_points = reward_points + (points - charge_points - reward_points)
       WHERE points > charge_points + reward_points`,
    )
    .run();
  const pointLogColumns = await db.prepare("PRAGMA table_info(point_logs)").all();
  const existingPointLogColumns = new Set(
    pointLogColumns.results.map((row) => String(row.name)),
  );
  const missingPointLogColumns = [
    ["point_bucket", "TEXT DEFAULT 'charge' NOT NULL"],
    ["reward_event_id", "INTEGER"],
  ].filter(([column]) => !existingPointLogColumns.has(column));
  for (const [column, definition] of missingPointLogColumns) {
    await db.prepare(`ALTER TABLE point_logs ADD COLUMN ${column} ${definition}`).run();
  }
  const popupColumns = await db.prepare("PRAGMA table_info(popups)").all();
  const existingPopupColumns = new Set(
    popupColumns.results.map((row) => String(row.name)),
  );
  const missingPopupColumns = [
    ["image_url", "TEXT DEFAULT '' NOT NULL"],
    ["width", "INTEGER DEFAULT 420 NOT NULL"],
    ["height", "INTEGER DEFAULT 460 NOT NULL"],
    ["position_x", "INTEGER DEFAULT 50 NOT NULL"],
    ["position_y", "INTEGER DEFAULT 50 NOT NULL"],
    ["target", "TEXT DEFAULT '_self' NOT NULL"],
  ].filter(([column]) => !existingPopupColumns.has(column));
  for (const [column, definition] of missingPopupColumns) {
    await db.prepare(`ALTER TABLE popups ADD COLUMN ${column} ${definition}`).run();
  }
  const productColumns = await db.prepare("PRAGMA table_info(products)").all();
  const existingProductColumns = new Set(
    productColumns.results.map((row) => String(row.name)),
  );
  const missingProductColumns = [
    ["brand", "TEXT DEFAULT '' NOT NULL"],
    ["product_code", "TEXT DEFAULT '' NOT NULL"],
    ["style_number", "TEXT DEFAULT '' NOT NULL"],
    ["image_urls", "TEXT DEFAULT '[]' NOT NULL"],
    ["media_json", "TEXT DEFAULT '[]' NOT NULL"],
    ["options_json", "TEXT DEFAULT '[]' NOT NULL"],
    ["variants_json", "TEXT DEFAULT '[]' NOT NULL"],
    ["detail_content", "TEXT DEFAULT '' NOT NULL"],
    ["shipping_info", "TEXT DEFAULT '' NOT NULL"],
    ["point_usage_mode", "TEXT DEFAULT 'full' NOT NULL"],
    ["point_max_percent", "INTEGER DEFAULT 100 NOT NULL"],
    ["cash_payment_enabled", "INTEGER DEFAULT 1 NOT NULL"],
    ["reward_on_cash_only", "INTEGER DEFAULT 1 NOT NULL"],
  ].filter(([column]) => !existingProductColumns.has(column));
  for (const [column, definition] of missingProductColumns) {
    await db.prepare(`ALTER TABLE products ADD COLUMN ${column} ${definition}`).run();
  }
  await db.prepare("DROP INDEX IF EXISTS products_style_number_unique").run();
  await db.prepare(`CREATE UNIQUE INDEX products_style_number_unique
    ON products (style_number) WHERE style_number != '' AND status != 'deleted'`).run();
  const salesChannelColumns = await db.prepare("PRAGMA table_info(sales_channels)").all();
  if (!salesChannelColumns.results.some((row) => String(row.name) === "broadcast_settings")) {
    await db.prepare("ALTER TABLE sales_channels ADD COLUMN broadcast_settings TEXT DEFAULT '{}' NOT NULL").run();
  }
  if (!salesChannelColumns.results.some((row) => String(row.name) === "category_settings")) {
    await db.prepare("ALTER TABLE sales_channels ADD COLUMN category_settings TEXT DEFAULT '[]' NOT NULL").run();
  }
  if (!salesChannelColumns.results.some((row) => String(row.name) === "view_count")) {
    await db.prepare("ALTER TABLE sales_channels ADD COLUMN view_count INTEGER DEFAULT 0 NOT NULL").run();
  }
  if (!salesChannelColumns.results.some((row) => String(row.name) === "showcase_visible")) {
    await db.prepare("ALTER TABLE sales_channels ADD COLUMN showcase_visible INTEGER DEFAULT 1 NOT NULL").run();
  }
  if (!salesChannelColumns.results.some((row) => String(row.name) === "showcase_order")) {
    await db.prepare("ALTER TABLE sales_channels ADD COLUMN showcase_order INTEGER DEFAULT 0 NOT NULL").run();
  }
  if (!salesChannelColumns.results.some((row) => String(row.name) === "avatar_image_url")) {
    await db.prepare("ALTER TABLE sales_channels ADD COLUMN avatar_image_url TEXT DEFAULT '' NOT NULL").run();
  }
  if (!salesChannelColumns.results.some((row) => String(row.name) === "contact_settings")) {
    await db.prepare("ALTER TABLE sales_channels ADD COLUMN contact_settings TEXT DEFAULT '{}' NOT NULL").run();
  }
  if (!salesChannelColumns.results.some((row) => String(row.name) === "original_image_url")) {
    await db.prepare("ALTER TABLE sales_channels ADD COLUMN original_image_url TEXT DEFAULT '' NOT NULL").run();
  }
  const channelOwnershipColumns = [
    ["owner_member_id", "INTEGER"],
    ["application_status", "TEXT DEFAULT 'admin_created' NOT NULL"],
    ["application_message", "TEXT DEFAULT '' NOT NULL"],
    ["admin_review_note", "TEXT DEFAULT '' NOT NULL"],
    ["applied_at", "TEXT"],
    ["approved_at", "TEXT"],
    ["publication_requested_at", "TEXT"],
    ["published_at", "TEXT"],
  ].filter(([column]) => !salesChannelColumns.results.some((row) => String(row.name) === column));
  for (const [column, definition] of channelOwnershipColumns) {
    await db.prepare(`ALTER TABLE sales_channels ADD COLUMN ${column} ${definition}`).run();
  }
  await db.prepare("CREATE INDEX IF NOT EXISTS sales_channels_showcase_idx ON sales_channels (showcase_visible, showcase_order)").run();
  await db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS sales_channels_owner_member_unique ON sales_channels (owner_member_id)").run();
  await db.prepare("CREATE INDEX IF NOT EXISTS sales_channels_application_status_idx ON sales_channels (application_status, updated_at)").run();
  const firstChannel = await db.prepare("SELECT id, broadcast_settings FROM sales_channels ORDER BY sort_order, id LIMIT 1").first<Record<string, unknown>>();
  if (firstChannel && String(firstChannel.broadcast_settings || "{}").trim() === "{}") {
    const legacyRows = await db.prepare(`SELECT key, value FROM settings WHERE key IN (${channelBroadcastSettingKeys.map(() => "?").join(",")})`)
      .bind(...channelBroadcastSettingKeys).all();
    const legacyBroadcastSettings = Object.fromEntries(legacyRows.results.map((row) => [String(row.key), String(row.value ?? "")]));
    await db.prepare("UPDATE sales_channels SET broadcast_settings = ?, updated_at = ? WHERE id = ?")
      .bind(JSON.stringify(legacyBroadcastSettings), nowIso(), Number(firstChannel.id)).run();
  }
  const cartColumns = await db.prepare("PRAGMA table_info(carts)").all();
  const existingCartColumns = new Set(cartColumns.results.map((row) => String(row.name)));
  const missingCartColumns = [
    ["selected_options", "TEXT DEFAULT '{}' NOT NULL"],
    ["channel_id", "INTEGER"],
    ["channel_name", "TEXT DEFAULT '' NOT NULL"],
  ];
  for (const [column, definition] of missingCartColumns.filter(([column]) => !existingCartColumns.has(column))) {
    await db.prepare(`ALTER TABLE carts ADD COLUMN ${column} ${definition}`).run();
  }
  const orderItemColumns = await db.prepare("PRAGMA table_info(order_items)").all();
  const existingOrderItemColumns = new Set(orderItemColumns.results.map((row) => String(row.name)));
  const missingOrderItemColumns = [
    ["selected_options", "TEXT DEFAULT '{}' NOT NULL"],
    ["channel_id", "INTEGER"],
    ["channel_name", "TEXT DEFAULT '' NOT NULL"],
  ];
  for (const [column, definition] of missingOrderItemColumns.filter(([column]) => !existingOrderItemColumns.has(column))) {
    await db.prepare(`ALTER TABLE order_items ADD COLUMN ${column} ${definition}`).run();
  }
  const shippingAddressColumns = await db.prepare("PRAGMA table_info(shipping_addresses)").all();
  const existingShippingAddressColumns = new Set(shippingAddressColumns.results.map((row) => String(row.name)));
  const missingShippingAddressColumns = [
    ["customs_code_encrypted", "TEXT DEFAULT '' NOT NULL"],
    ["customs_code_masked", "TEXT DEFAULT '' NOT NULL"],
    ["customs_verified_at", "TEXT"],
    ["customs_expires_at", "TEXT"],
    ["customs_save_consent_at", "TEXT"],
  ].filter(([column]) => !existingShippingAddressColumns.has(column));
  for (const [column, definition] of missingShippingAddressColumns) {
    await db.prepare(`ALTER TABLE shipping_addresses ADD COLUMN ${column} ${definition}`).run();
  }
  const inquiryColumns = await db.prepare("PRAGMA table_info(inquiries)").all();
  if (!inquiryColumns.results.some((row) => String(row.name) === "product_id")) {
    await db.prepare("ALTER TABLE inquiries ADD COLUMN product_id INTEGER").run();
  }
  const orderColumns = await db.prepare("PRAGMA table_info(orders)").all();
  const existingOrderColumns = new Set(
    orderColumns.results.map((row) => String(row.name)),
  );
  const missingOrderColumns = [
    ["channel_id", "INTEGER"],
    ["channel_name", "TEXT DEFAULT '' NOT NULL"],
    ["courier", "TEXT DEFAULT '' NOT NULL"],
    ["tracking_no", "TEXT DEFAULT '' NOT NULL"],
    ["shipped_at", "TEXT"],
    ["delivered_at", "TEXT"],
    ["postal_code", "TEXT DEFAULT '' NOT NULL"],
    ["address1", "TEXT DEFAULT '' NOT NULL"],
    ["address_detail", "TEXT DEFAULT '' NOT NULL"],
    ["address_updated_at", "TEXT"],
    ["used_charge_points", "INTEGER DEFAULT 0 NOT NULL"],
    ["used_reward_points", "INTEGER DEFAULT 0 NOT NULL"],
    ["payment_method", "TEXT DEFAULT 'points' NOT NULL"],
    ["cash_payment_channel", "TEXT DEFAULT '' NOT NULL"],
    ["payment_status", "TEXT DEFAULT 'paid' NOT NULL"],
    ["cash_amount", "INTEGER DEFAULT 0 NOT NULL"],
    ["purchase_reward_points", "INTEGER DEFAULT 0 NOT NULL"],
    ["purchase_reward_status", "TEXT DEFAULT 'none' NOT NULL"],
    ["point_reservation_status", "TEXT DEFAULT 'captured' NOT NULL"],
    ["payment_expires_at", "TEXT"],
    ["payment_confirmed_at", "TEXT"],
    ["subtotal_points", "INTEGER DEFAULT 0 NOT NULL"],
    ["shipping_fee", "INTEGER DEFAULT 0 NOT NULL"],
    ["discount_amount", "INTEGER DEFAULT 0 NOT NULL"],
    ["coupon_id", "INTEGER"],
    ["benefit_snapshot", "TEXT DEFAULT '{}' NOT NULL"],
    ["idempotency_key", "TEXT DEFAULT '' NOT NULL"],
    ["delivery_stage", "TEXT DEFAULT 'payment_confirmed' NOT NULL"],
    ["international_tracking_no", "TEXT DEFAULT '' NOT NULL"],
    ["customs_status", "TEXT DEFAULT 'waiting' NOT NULL"],
    ["customs_code_encrypted", "TEXT DEFAULT '' NOT NULL"],
    ["customs_code_masked", "TEXT DEFAULT '' NOT NULL"],
    ["customs_verified_at", "TEXT"],
    ["customs_expires_at", "TEXT"],
  ].filter(([column]) => !existingOrderColumns.has(column));
  for (const [column, definition] of missingOrderColumns) {
    await db.prepare(`ALTER TABLE orders ADD COLUMN ${column} ${definition}`).run();
  }
  await db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS orders_member_idempotency_idx ON orders (member_id, idempotency_key) WHERE idempotency_key != ''").run();
  await db.prepare(`CREATE TRIGGER IF NOT EXISTS products_stock_nonnegative
    BEFORE UPDATE OF stock ON products
    WHEN NEW.stock < 0
    BEGIN SELECT RAISE(ABORT, 'insufficient_stock'); END`).run();
  await db.prepare(`CREATE TRIGGER IF NOT EXISTS orders_reward_reservation_guard
    BEFORE INSERT ON orders
    WHEN NEW.used_reward_points > (
      COALESCE((SELECT reward_points FROM members WHERE id = NEW.member_id), 0) -
      COALESCE((SELECT SUM(used_reward_points) FROM orders WHERE member_id = NEW.member_id AND point_reservation_status = 'reserved'), 0)
    )
    BEGIN SELECT RAISE(ABORT, 'insufficient_reward'); END`).run();
  await db.prepare(`CREATE TRIGGER IF NOT EXISTS orders_charge_reservation_guard
    BEFORE INSERT ON orders
    WHEN NEW.used_charge_points > (
      COALESCE((SELECT charge_points FROM members WHERE id = NEW.member_id), 0) -
      COALESCE((SELECT SUM(used_charge_points) FROM orders WHERE member_id = NEW.member_id AND point_reservation_status = 'reserved'), 0)
    )
    BEGIN SELECT RAISE(ABORT, 'insufficient_reward'); END`).run();
  const couponColumns = await db.prepare("PRAGMA table_info(coupons)").all();
  const existingCouponColumns = new Set(couponColumns.results.map((row) => String(row.name)));
  const missingCouponColumns = [
    ["coupon_type", "TEXT DEFAULT 'point' NOT NULL"],
    ["discount_kind", "TEXT DEFAULT 'fixed' NOT NULL"],
    ["discount_value", "INTEGER DEFAULT 0 NOT NULL"],
    ["minimum_order", "INTEGER DEFAULT 0 NOT NULL"],
    ["target_category", "TEXT DEFAULT '전체' NOT NULL"],
    ["claimed_by", "INTEGER"],
    ["claimed_at", "TEXT"],
  ].filter(([column]) => !existingCouponColumns.has(column));
  for (const [column, definition] of missingCouponColumns) {
    await db.prepare(`ALTER TABLE coupons ADD COLUMN ${column} ${definition}`).run();
  }
  await db
    .prepare(
      `UPDATE orders
       SET address1 = address
       WHERE (address1 = '' OR address1 IS NULL) AND address != ''`,
    )
    .run();
  await db
    .prepare(
      `UPDATE orders
       SET status = '배송완료', delivered_at = COALESCE(delivered_at, created_at)
       WHERE status = '완료'`,
    )
    .run();
  const reviewColumns = await db.prepare("PRAGMA table_info(reviews)").all();
  const existingReviewColumns = new Set(
    reviewColumns.results.map((row) => String(row.name)),
  );
  const missingReviewColumns = [
    ["order_id", "INTEGER"],
    ["order_item_id", "INTEGER"],
    ["reward_points", "INTEGER DEFAULT 0 NOT NULL"],
    ["reward_status", "TEXT DEFAULT '지급' NOT NULL"],
    ["rewarded_at", "TEXT"],
    ["revoked_at", "TEXT"],
    ["admin_reply", "TEXT DEFAULT '' NOT NULL"],
    ["answered_at", "TEXT"],
    ["hidden_reason", "TEXT DEFAULT '' NOT NULL"],
    ["deleted_at", "TEXT"],
    ["updated_at", "TEXT"],
  ].filter(([column]) => !existingReviewColumns.has(column));
  for (const [column, definition] of missingReviewColumns) {
    await db.prepare(`ALTER TABLE reviews ADD COLUMN ${column} ${definition}`).run();
  }
  await db
    .prepare(
      `CREATE UNIQUE INDEX IF NOT EXISTS reviews_order_item_unique
       ON reviews (order_item_id)`,
    )
    .run();
  const adminColumns = await db.prepare("PRAGMA table_info(admin_accounts)").all();
  const existingAdminColumns = new Set(
    adminColumns.results.map((row) => String(row.name)),
  );
  if (!existingAdminColumns.has("permissions")) {
    const defaultPermissions = JSON.stringify(DEFAULT_MANAGER_PERMISSIONS).replaceAll(
      "'",
      "''",
    );
    await db
      .prepare(
        `ALTER TABLE admin_accounts
         ADD COLUMN permissions TEXT DEFAULT '${defaultPermissions}' NOT NULL`,
      )
      .run();
  }
  schemaReady = true;
}

export async function ensureSeedData() {
  await ensureRuntimeSchema();
  const db = getD1();
  const now = nowIso();

  const supervisor = await db
    .prepare("SELECT id, password_hash, force_password_change FROM admin_accounts WHERE role = 'supervisor' LIMIT 1")
    .first<{ id: number; password_hash: string; force_password_change: number }>();
  if (!supervisor) {
    await db
      .prepare(
        `INSERT OR IGNORE INTO admin_accounts
          (username, name, password_hash, role, permissions, status, force_password_change,
           failed_attempts, locked_until, last_login_at, created_at, updated_at)
         VALUES ('admin', '슈퍼바이저', ?, 'supervisor', ?, 'active', 1,
           0, NULL, NULL, ?, ?)`,
      )
      .bind(
        await hashAdminPassword("admin123456"),
        JSON.stringify(DEFAULT_MANAGER_PERMISSIONS),
        now,
        now,
      )
      .run();
  } else if (
    supervisor.force_password_change &&
    (await verifyAdminPassword("admin", supervisor.password_hash))
  ) {
    await db
      .prepare(
        `UPDATE admin_accounts
         SET password_hash = ?, failed_attempts = 0, locked_until = NULL, updated_at = ?
         WHERE id = ?`,
      )
      .bind(await hashAdminPassword("admin123456"), now, supervisor.id)
      .run();
  }

  const statements = Object.entries(defaultSettings).map(([key, value]) =>
    db
      .prepare(
        "INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES (?, ?, ?)",
      )
      .bind(key, value, now),
  );
  await db.batch(statements);
  const productFieldVersion = await db
    .prepare("SELECT value FROM settings WHERE key = 'fashion_product_fields_version'")
    .first<{ value: string }>();
  if (productFieldVersion?.value !== "3") {
    const categoryRows = await db
      .prepare("SELECT key, value FROM settings WHERE key IN ('product_categories', 'product_category_config')")
      .all<{ key: string; value: string }>();
    const categoryValues = Object.fromEntries(categoryRows.results.map((row) => [row.key, row.value]));
    const expandedFashion = fashionCategorySettings(categoryValues.product_category_config, categoryValues.product_categories);
    await db.batch([
      db.prepare("UPDATE settings SET value = ?, updated_at = ? WHERE key = 'product_categories'")
        .bind(JSON.stringify(expandedFashion.names), now),
      db.prepare("UPDATE settings SET value = ?, updated_at = ? WHERE key = 'product_category_config'")
        .bind(JSON.stringify(expandedFashion.config), now),
      db.prepare(
        `INSERT INTO settings (key, value, updated_at) VALUES ('fashion_product_fields_version', '3', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      ).bind(now),
    ]);
    await db.prepare("UPDATE products SET category = '신발' WHERE category IN ('슈즈', '신발류') AND status != 'deleted'").run();
    await db.prepare(
      `INSERT OR IGNORE INTO product_catalog_details
        (product_id, name_en, subcategory, product_type, sale_price, points_price,
         featured, type_fields_json, search_sources_json, thumbnail_url,
         source_kind, source_reference, created_at, updated_at)
       SELECT id, '',
         CASE
           WHEN category = '신발' AND (name LIKE '%러닝%' OR description LIKE '%러닝%') THEN '러닝화'
           WHEN category = '신발' THEN '스니커즈'
           WHEN category = '가방' AND name LIKE '%백팩%' THEN '백팩'
           WHEN category = '가방' AND name LIKE '%크로스%' THEN '크로스백'
           WHEN category = '의류' AND (name LIKE '%재킷%' OR name LIKE '%트랙탑%') THEN '아우터'
           WHEN category = '의류' THEN '상의'
           ELSE ''
         END,
         CASE WHEN category = '신발' THEN 'shoes' WHEN category = '의류' THEN 'clothing' WHEN category = '가방' THEN 'bags' ELSE 'accessories' END,
         point_price, point_price, 0, '{}', '[]', image_url,
         'seed', product_code, ?, ?
       FROM products WHERE product_code LIKE 'DEMO-%'`,
    ).bind(now, now).run();
  }
  await db.batch([
    db.prepare("UPDATE products SET badge = '' WHERE badge IN ('확인필요', '확인 필요')"),
    db.prepare(`UPDATE settings SET value = '리워드', updated_at = ? WHERE key = 'point_name' AND value IN ('포인트', '가든포인트', '리워드포인트')`).bind(now),
    db.prepare(`UPDATE settings SET value = ?, updated_at = ? WHERE key = 'hero_title' AND value LIKE '%쌓은 포인트%'`).bind(defaultSettings.hero_title, now),
    db.prepare(`UPDATE settings SET value = ?, updated_at = ? WHERE key = 'hero_subtitle' AND value LIKE '%포인트로만 주문%'`).bind(defaultSettings.hero_subtitle, now),
    db.prepare(`UPDATE settings SET value = ?, updated_at = ? WHERE key = 'seo_description' AND value LIKE '%실제 결제 없이%'`).bind(defaultSettings.seo_description, now),
    db.prepare(`UPDATE settings SET value = ?, updated_at = ? WHERE key = 'seo_title' AND value LIKE '%회원 전용 포인트몰%'`).bind(defaultSettings.seo_title, now),
    db.prepare(`UPDATE settings SET value = ?, updated_at = ? WHERE key = 'footer_notice' AND value LIKE '%현금 결제를 제공하지%'`).bind(defaultSettings.footer_notice, now),
    db.prepare(`UPDATE settings SET value = ?, updated_at = ? WHERE key = 'site_url' AND value LIKE '%member-point-mall%'`).bind(defaultSettings.site_url, now),
  ]);

  const productCount = await db
    .prepare("SELECT COUNT(*) AS count FROM products")
    .first<{ count: number }>();
  const catalogVersion = await db
    .prepare("SELECT value FROM settings WHERE key = 'catalog_version'")
    .first<{ value: string }>();
  const hasProducts = Number(productCount?.count || 0) > 0;
  if (!hasProducts || catalogVersion?.value !== "8") {
    // 데모 상품은 완전히 빈 새 데이터베이스에만 넣는다. 운영 중 상품이 하나라도
    // 있으면 누락된 데모 상품을 복원하거나 전체 상품을 초기화하지 않는다.
    if (!hasProducts) {
      await db.batch(
        seedProducts.map((product) =>
          db
            .prepare(
              `INSERT INTO products
                (name, category, brand, product_code, description, image_url, image_urls,
                 media_json, options_json, detail_content, shipping_info, point_price,
                 point_usage_mode, point_max_percent, cash_payment_enabled, reward_on_cash_only,
                 stock, status, badge, sales_count, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'full', 100, 1, 1,
                 ?, 'active', ?, 0, ?)`,
            )
            .bind(
              product.name,
              product.category,
              product.brand,
              product.productCode,
              product.description,
              product.imageUrl,
              product.imageUrls,
              product.mediaJson,
              product.optionsJson,
              product.detailContent,
              product.shippingInfo,
              product.pointPrice,
              product.stock,
              product.badge,
              now,
            ),
        ),
      );
    }
    const catalogSettings = await db
      .prepare("SELECT key, value FROM settings WHERE key IN ('product_categories', 'product_category_config', 'product_brands', 'youtube_replays', 'youtube_shorts')")
      .all<{ key: string; value: string }>();
    const currentCatalog = Object.fromEntries(catalogSettings.results.map((row) => [row.key, row.value]));
    const fashionSettings = fashionCategorySettings(currentCatalog.product_category_config, currentCatalog.product_categories);
    let currentBrands: string[] = [];
    try {
      const parsed = JSON.parse(currentCatalog.product_brands || "[]");
      if (Array.isArray(parsed)) currentBrands = parsed.map(String);
    } catch {
      currentBrands = [];
    }
    const brands = Array.from(new Set([...currentBrands, "NIKE", "ADIDAS", "ASICS", "NEW BALANCE"]));
    const liveShoeRows = await db
      .prepare("SELECT id FROM products WHERE category = '신발' AND status = 'active' ORDER BY id LIMIT 12")
      .all<{ id: number }>();
    const liveProductIds = liveShoeRows.results.map((row) => Number(row.id));
    const liveSlotNumbers = liveProductIds.map((_, index) => index + 1);
    const liveSlots = liveProductIds.map((productId, index) => ({ number: index + 1, productId }));
    let replays: Array<Record<string, unknown>> = [];
    let shorts: Array<Record<string, unknown>> = [];
    try {
      const parsed = JSON.parse(currentCatalog.youtube_replays || "[]");
      if (Array.isArray(parsed)) replays = parsed;
    } catch { replays = []; }
    try {
      const parsed = JSON.parse(currentCatalog.youtube_shorts || "[]");
      if (Array.isArray(parsed)) shorts = parsed;
    } catch { shorts = []; }
    const shoeReplays = replays.map((replay, replayIndex) => ({
      ...replay,
      timeline: Array.isArray(replay.timeline)
        ? replay.timeline.map((rawEntry, entryIndex) => {
            const entry = rawEntry && typeof rawEntry === "object" ? rawEntry as Record<string, unknown> : {};
            return { ...entry, productId: liveProductIds[(replayIndex + entryIndex) % Math.max(1, liveProductIds.length)] || 0 };
          })
        : [],
    }));
    const shoeShorts = shorts.map((short, index) => ({
      ...short,
      productId: liveProductIds[index % Math.max(1, liveProductIds.length)] || 0,
    }));
    await db.batch([
      db.prepare(`INSERT INTO settings (key, value, updated_at) VALUES ('product_categories', ?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`).bind(JSON.stringify(fashionSettings.names), now),
      db.prepare(`INSERT INTO settings (key, value, updated_at) VALUES ('product_category_config', ?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`).bind(JSON.stringify(fashionSettings.config), now),
      db.prepare(`INSERT INTO settings (key, value, updated_at) VALUES ('product_brands', ?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`).bind(JSON.stringify(brands), now),
      db.prepare(`INSERT INTO settings (key, value, updated_at) VALUES ('youtube_live_slot_count', ?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`).bind(String(liveSlotNumbers.length), now),
      db.prepare(`INSERT INTO settings (key, value, updated_at) VALUES ('youtube_live_slot_numbers', ?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`).bind(JSON.stringify(liveSlotNumbers), now),
      db.prepare(`INSERT INTO settings (key, value, updated_at) VALUES ('youtube_live_product_ids', ?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`).bind(JSON.stringify(liveProductIds), now),
      db.prepare(`INSERT INTO settings (key, value, updated_at) VALUES ('youtube_live_slots', ?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`).bind(JSON.stringify(liveSlots), now),
      db.prepare(`INSERT INTO settings (key, value, updated_at) VALUES ('youtube_live_current_number', ?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`).bind(liveSlotNumbers.length ? "1" : "", now),
      db.prepare(`INSERT INTO settings (key, value, updated_at) VALUES ('youtube_live_history', ?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`).bind(JSON.stringify(liveSlotNumbers.slice(0, 4)), now),
      db.prepare(`INSERT INTO settings (key, value, updated_at) VALUES ('youtube_replays', ?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`).bind(JSON.stringify(shoeReplays), now),
      db.prepare(`INSERT INTO settings (key, value, updated_at) VALUES ('youtube_shorts', ?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`).bind(JSON.stringify(shoeShorts), now),
    ]);
    const currentProducts = await db
      .prepare("SELECT id, name, category, point_price FROM products WHERE status = 'active' AND product_code LIKE 'DEMO-%' ORDER BY id")
      .all<CatalogProductRow>();
    if (currentProducts.results.length) {
      await reconcileCatalogReferences(currentProducts.results, now);
    }
  }
  await db
    .prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES ('catalog_version', '8', ?)
       ON CONFLICT(key) DO UPDATE SET value = '8', updated_at = excluded.updated_at`,
    )
    .bind(now)
    .run();

  await ensureUserSkuDraftImport(db, now);

  await db.batch([
    db.prepare("UPDATE members SET role = 'member' WHERE role != 'member'"),
    db.prepare(
      "UPDATE products SET brand = 'POINT SELECT' WHERE brand = '' OR brand IS NULL",
    ),
    db.prepare(
      `UPDATE admin_accounts
       SET role = 'supervisor', updated_at = ?
       WHERE lower(username) = 'admin' AND role != 'supervisor'`,
    ).bind(now),
    db.prepare(
      `UPDATE admin_accounts
       SET role = 'manager', updated_at = ?
       WHERE lower(username) != 'admin'
         AND role NOT IN ('manager', 'supervisor')`,
    ).bind(now),
  ]);

  const livePromoVersion = await db
    .prepare("SELECT value FROM settings WHERE key = 'live_reward_promo_version'")
    .first<{ value: string }>();
  if (livePromoVersion?.value !== "1") {
    await db.batch([
      db.prepare("DELETE FROM popups"),
      db.prepare(
        `INSERT INTO popups
          (title, content, button_text, link_url, background_color, image_url, width, height,
           position_x, position_y, target, active, starts_at, ends_at)
         VALUES (?, ?, ?, ?, ?, '', 440, 470, 50, 50, '_self', 1, ?, ?)`,
      ).bind(
        "생방송 보고 리워드로 더 알뜰하게",
        "유튜브 생방송에서 상품 번호를 확인하고, 보유 리워드를 사용한 뒤 남은 금액만 결제하세요. 재방송과 쇼츠에서도 소개 상품을 바로 찾을 수 있습니다.",
        "생방송 쇼핑 보기",
        "/#youtube-live",
        "#101827",
        "2025-01-01T00:00:00.000Z",
        "2035-12-31T23:59:59.000Z",
      ),
      db.prepare(
        `INSERT INTO settings (key, value, updated_at) VALUES ('live_reward_promo_version', '1', ?)
         ON CONFLICT(key) DO UPDATE SET value = '1', updated_at = excluded.updated_at`,
      ).bind(now),
    ]);
  }

  const prepaidCleanupVersion = await db
    .prepare("SELECT value FROM settings WHERE key = 'prepaid_cleanup_version'")
    .first<{ value: string }>();
  if (prepaidCleanupVersion?.value !== "2") {
    await db.batch([
      db.prepare("DELETE FROM finance_requests"),
      db.prepare("DELETE FROM point_logs WHERE point_bucket = 'charge' OR type IN ('입금', '충전', '출금', '환급')"),
      db.prepare("UPDATE members SET points = MAX(0, reward_points), charge_points = 0"),
      db.prepare(
        `INSERT INTO settings (key, value, updated_at) VALUES ('prepaid_cleanup_version', '2', ?)
         ON CONFLICT(key) DO UPDATE SET value = '2', updated_at = excluded.updated_at`,
      ).bind(now),
    ]);
  }

  const noticeCount = await db
    .prepare("SELECT COUNT(*) AS count FROM notices")
    .first<{ count: number }>();
  if (!noticeCount?.count) {
    await db
      .prepare(
        "INSERT INTO notices (title, content, active, created_at) VALUES (?, ?, 1, ?)",
      )
      .bind(
        "리워드 쇼핑몰 이용 안내",
        "상품을 고른 뒤 주문서에서 리워드 전액, 무통장입금, 카카오톡 송금 또는 혼합 결제를 선택할 수 있습니다.",
        now,
      )
      .run();
  }
  await db
    .prepare(
      `UPDATE notices SET title = '리워드 쇼핑몰 이용 안내',
         content = '상품을 고른 뒤 주문서에서 리워드 전액, 무통장입금, 카카오톡 송금 또는 혼합 결제를 선택할 수 있습니다.'
       WHERE title = '포인트몰 이용 안내'
         AND content LIKE '%보유 포인트로만 주문%'`,
    )
    .run();
  await ensureInitialTestData();
}

export async function getPublicSettings() {
  const rows = await getD1().prepare("SELECT key, value FROM settings").all();
  return Object.fromEntries(
    rows.results
      .filter((row) => String(row.key) !== "signup_code")
      .map((row) => [String(row.key), String(row.value)]),
  ) as Record<string, string>;
}

type PublicCatalogOptions = {
  page?: number;
  limit?: number;
  category?: string;
  search?: string;
  includeHomeProducts?: boolean;
  trackView?: boolean;
};

const publicCatalogPage = (options: PublicCatalogOptions = {}) => ({
  page: Math.max(1, Math.floor(Number(options.page || 1))),
  limit: Math.max(1, Math.min(48, Math.floor(Number(options.limit || 8)))),
  category: String(options.category || "전체").trim() || "전체",
  search: String(options.search || "").trim().toLowerCase().slice(0, 100),
});

async function fullProductsByIds(ids: number[]) {
  const uniqueIds = Array.from(new Set(ids.map(Number).filter((id) => Number.isInteger(id) && id > 0)));
  if (!uniqueIds.length) return [];
  const placeholders = uniqueIds.map(() => "?").join(",");
  const rows = await getD1().prepare(
    `SELECT ${PRODUCT_LIST_COLUMNS}
     FROM products p
     LEFT JOIN product_catalog_details d ON d.product_id = p.id
     ${PRODUCT_REVIEW_JOIN}
     WHERE p.status = 'active' AND p.id IN (${placeholders})`,
  ).bind(...uniqueIds).all();
  const byId = new Map(rows.results.map((row) => [Number(row.id), row]));
  return uniqueIds.map((id) => byId.get(id)).filter(Boolean);
}

function publicCatalogMatches(product: Record<string, unknown>, category: string, search: string, categoryConfig: ReturnType<typeof parseCategoryConfig>) {
  if (category !== "전체" && !productMatchesCategory(product, category, categoryConfig)) return false;
  if (!search) return true;
  return [product.name, product.style_number, product.product_code, product.brand]
    .some((value) => String(value || "").toLowerCase().includes(search));
}

export async function getPublicCatalog(options: PublicCatalogOptions = {}) {
  const db = getD1();
  const request = publicCatalogPage(options);
  const [settingsRows, productIndex, reviews, popups, notices, salesChannels] = await Promise.all([
    db.prepare("SELECT key, value FROM settings").all(),
    db
      .prepare(
        `SELECT ${PRODUCT_CATALOG_INDEX_COLUMNS}
         FROM products p
         LEFT JOIN product_catalog_details d ON d.product_id = p.id
         WHERE p.status = 'active'
         ORDER BY p.sales_count DESC, p.id DESC`,
      )
      .all(),
    db
      .prepare(
        `SELECT r.*, p.name AS product_name, m.name AS member_name
         FROM reviews r
         JOIN products p ON p.id = r.product_id
         JOIN members m ON m.id = r.member_id
         WHERE r.visible = 1 AND r.deleted_at IS NULL
         ORDER BY r.id DESC LIMIT 30`,
      )
      .all(),
    db
      .prepare(
        `SELECT * FROM popups
         WHERE active = 1 AND starts_at <= ? AND ends_at >= ?
         ORDER BY id DESC LIMIT 1`,
      )
      .bind(nowIso(), nowIso())
      .all(),
    db.prepare("SELECT * FROM notices WHERE active = 1 ORDER BY id DESC LIMIT 5").all(),
    db.prepare(
      `SELECT c.*,
        (SELECT GROUP_CONCAT(cp.product_id) FROM sales_channel_products cp WHERE cp.channel_id = c.id) AS product_ids
       FROM sales_channels c
       WHERE c.status = 'active'
       ORDER BY c.sort_order, c.id`,
    ).all(),
  ]);
  const settings = Object.fromEntries(
    settingsRows.results
      .filter((row) => String(row.key) !== "signup_code")
      .map((row) => [String(row.key), String(row.value)]),
  );
  let legacyCategoryNames: string[] = [];
  try {
    const parsed = JSON.parse(settings.product_categories || "[]");
    if (Array.isArray(parsed)) legacyCategoryNames = parsed.map(String).filter(Boolean);
  } catch { legacyCategoryNames = []; }
  const categoryConfig = parseCategoryConfig(settings.product_category_config, legacyCategoryNames);
  const allProducts = productIndex.results as Record<string, unknown>[];
  const candidates = allProducts.filter((product) => publicCatalogMatches(product, request.category, request.search, categoryConfig));
  const start = (request.page - 1) * request.limit;
  const pageIds = candidates.slice(start, start + request.limit).map((product) => Number(product.id));
  const categoryCounts = Object.fromEntries(selectableCategoryNames(categoryConfig).map((name) => [
    name,
    allProducts.filter((product) => productMatchesCategory(product, name, categoryConfig)).length,
  ]));
  const homeIds = new Set<number>();
  if (options.includeHomeProducts !== false && request.page === 1 && !request.search && request.category === "전체") {
    for (const product of allProducts.slice(0, 24)) homeIds.add(Number(product.id));
    for (const product of [...allProducts].sort((a, b) => Number(b.id) - Number(a.id)).slice(0, 8)) homeIds.add(Number(product.id));
    try {
      const sections = JSON.parse(settings.home_display_sections || "[]");
      if (Array.isArray(sections)) {
        for (const section of sections) for (const id of Array.isArray(section?.productIds) ? section.productIds : []) homeIds.add(Number(id));
      }
    } catch { /* optional display settings */ }
  }
  const products = await fullProductsByIds([...pageIds, ...homeIds]);
  return {
    settings,
    products,
    catalog: {
      items: pageIds.map((id) => products.find((product: any) => Number(product.id) === id)).filter(Boolean),
      total: candidates.length,
      page: request.page,
      pageSize: request.limit,
      category: request.category,
      search: request.search,
      categoryCounts,
    },
    salesChannels: salesChannels.results,
    cart: [],
    addresses: [],
    wishlist: [],
    orders: [],
    reviewableItems: [],
    pointLogs: [],
    pointSummary: { earned: 0, used: 0, count: 0 },
    attendance: { enabled: settings.attendance_enabled === "true", todayChecked: false, today: null, streak: 0, dailyPoints: Number(settings.attendance_daily_points || 0), streakDays: Number(settings.attendance_streak_days || 0), streakBonus: Number(settings.attendance_streak_bonus || 0), history: [] },
    finance: [],
    reviews: reviews.results,
    popups: popups.results,
    notices: notices.results,
    inquiries: [],
    memberAuthType: "guest" as const,
    member: {
      id: 0,
      email: "",
      name: "방문자",
      role: "guest",
      status: "guest",
      points: 0,
      phone: "",
    },
  };
}

export async function getPublicChannel(slug: string, options: PublicCatalogOptions = {}) {
  const db = getD1();
  const request = publicCatalogPage(options);
  const channel = await db
    .prepare("SELECT * FROM sales_channels WHERE slug = ? AND status = 'active'")
    .bind(slug)
    .first<Record<string, unknown>>();
  if (!channel) return null;
  if (options.trackView !== false) {
    await db.prepare("UPDATE sales_channels SET view_count = view_count + 1 WHERE id = ?").bind(Number(channel.id)).run();
    channel.view_count = Number(channel.view_count || 0) + 1;
  }
  const [productIndex, otherChannels, settingsRows] = await Promise.all([
    db.prepare(
      `SELECT ${PRODUCT_CATALOG_INDEX_COLUMNS},
        COALESCE(cp.featured, 0) AS channel_featured, cp.sort_order AS channel_sort_order,
        CASE WHEN cp.product_id IS NULL THEN 0 ELSE 1 END AS channel_linked,
        cp.channel_id AS linked_channel_id
       FROM products p
       LEFT JOIN product_catalog_details d ON d.product_id = p.id
       LEFT JOIN sales_channel_products cp ON p.id = cp.product_id AND cp.channel_id = ?
       WHERE p.status = 'active'
       ORDER BY channel_linked DESC, cp.featured DESC, cp.sort_order, p.id DESC`,
    ).bind(Number(channel.id)).all(),
    db.prepare(
      `SELECT c.*,
        (SELECT p.image_url FROM sales_channel_products cp
         JOIN products p ON p.id = cp.product_id
         WHERE cp.channel_id = c.id AND p.status = 'active'
         ORDER BY cp.featured DESC, cp.sort_order, p.id DESC LIMIT 1) AS product_image_url,
        (SELECT COUNT(*) FROM sales_channel_products cp
         JOIN products p ON p.id = cp.product_id
         WHERE cp.channel_id = c.id AND p.status = 'active') AS product_count
       FROM sales_channels c
       WHERE c.status = 'active' AND c.showcase_visible = 1 AND c.id != ?
       ORDER BY c.showcase_order, c.sort_order, c.id LIMIT 12`,
    ).bind(Number(channel.id)).all(),
    db.prepare("SELECT key, value FROM settings").all(),
  ]);
  const settings = Object.fromEntries(
    settingsRows.results
      .filter((row) => String(row.key) !== "signup_code")
      .map((row) => [String(row.key), String(row.value)]),
  );
  let broadcastSettings: Record<string, string> = {};
  try {
    const parsed = JSON.parse(String(channel.broadcast_settings || "{}"));
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      broadcastSettings = Object.fromEntries(Object.entries(parsed).map(([key, value]) => [key, String(value ?? "")]));
    }
  } catch { broadcastSettings = {}; }
  let contactSettings: Record<string, string> = {};
  try {
    const parsed = JSON.parse(String(channel.contact_settings || "{}"));
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      contactSettings = Object.fromEntries(Object.entries(parsed).map(([key, value]) => [key, String(value ?? "")]));
    }
  } catch { contactSettings = {}; }
  const channelSettings: Record<string, string> = {
    ...settings,
    ...broadcastSettings,
    ...(contactSettings.use_channel_contact === "true" ? contactSettings : {}),
    ...(contactSettings.use_channel_contact === "true" ? { contact_floating_enabled: "true" } : {}),
    storefront_skin: "youtube",
    // A channel's visibility is independent from the legacy global live setting.
    // Missing, malformed, or explicitly false channel values must never expose an
    // existing YouTube URL on the customer-facing channel page.
    youtube_live_enabled: broadcastSettings.youtube_live_enabled === "true" ? "true" : "false",
    youtube_live_title: broadcastSettings.youtube_live_title || String(channel.name || settings.youtube_live_title || "라이브 쇼핑"),
    youtube_live_url: broadcastSettings.youtube_live_url || String(channel.youtube_url || settings.youtube_live_url || ""),
    youtube_live_notice: broadcastSettings.youtube_live_notice || String(channel.description || settings.youtube_live_notice || ""),
  };
  let legacyCategoryNames: string[] = [];
  try {
    const parsed = JSON.parse(settings.product_categories || "[]");
    if (Array.isArray(parsed)) legacyCategoryNames = parsed.map(String).filter(Boolean);
  } catch { legacyCategoryNames = []; }
  const globalCategoryConfig = parseCategoryConfig(settings.product_category_config, legacyCategoryNames);
  type ChannelCategorySetting = { sourceName: string; label: string; visible: boolean; sortOrder: number; productIds?: number[]; parentSourceName?: string; assignmentMode?: "auto" | "manual"; ruleType?: "brand" | "category"; ruleValue?: string; ruleCategory?: string };
  let categoryOverrides: ChannelCategorySetting[] = [];
  try {
    const parsed = JSON.parse(String(channel.category_settings || "[]"));
    if (Array.isArray(parsed)) categoryOverrides = parsed;
  } catch { categoryOverrides = []; }
  const overrideByName = new Map(categoryOverrides.map((entry, index) => [String(entry.sourceName || ""), {
    label: String(entry.label || entry.sourceName || ""),
    visible: entry.visible !== false,
    sortOrder: Number(entry.sortOrder ?? index),
    productIds: Array.isArray(entry.productIds) ? entry.productIds.map(Number).filter((id) => id > 0) : [],
    assignmentMode: entry.assignmentMode === "auto" ? "auto" : "manual",
    ruleType: entry.ruleType === "brand" ? "brand" : entry.ruleType === "category" ? "category" : undefined,
    ruleValue: String(entry.ruleValue || "").trim(),
    ruleCategory: String(entry.ruleCategory || "").trim(),
  }]));
  const allChannelCandidates = productIndex.results as Array<{ id?: unknown; name?: unknown; style_number?: unknown; product_code?: unknown; brand?: unknown; category?: unknown; subcategory?: unknown; channel_linked?: unknown; channel_featured?: unknown; channel_sort_order?: unknown }>;
  const directlyLinkedProductIds = allChannelCandidates.filter((product) => Number(product.channel_linked || 0) === 1).map((product) => Number(product.id)).filter(Boolean);
  const brandRuleCategoryCache = new Map<string, string>();
  const brandRuleCategory = (entry: ChannelCategorySetting) => {
    const key = `${String(entry.sourceName || "").trim()}::${String(entry.label || "").trim()}`;
    const cached = brandRuleCategoryCache.get(key);
    if (cached !== undefined) return cached;
    const category = inferChannelBrandRuleCategory(entry, categoryOverrides, allChannelCandidates, globalCategoryConfig, directlyLinkedProductIds);
    brandRuleCategoryCache.set(key, category);
    return category;
  };
  const brandMatchCache = new Map<string, boolean>();
  const matchesBrand = (productBrand: unknown, ruleBrand: unknown) => {
    const key = `${String(productBrand || "")}\u0000${String(ruleBrand || "")}`;
    if (!brandMatchCache.has(key)) brandMatchCache.set(key, brandMatchesChannelRule(productBrand, ruleBrand));
    return Boolean(brandMatchCache.get(key));
  };
  const categoryProductIds = new Map<string, number[]>();
  const categoryRuleNames = selectableCategoryNames(globalCategoryConfig);
  const parentCategoryFor = (entry: ChannelCategorySetting) => entry.parentSourceName
    ? categoryOverrides.find((candidate) => candidate.sourceName === entry.parentSourceName)
    : undefined;
  const isCuratedChannelCategory = (entry: ChannelCategorySetting) => /추천|한정|협업/i.test(String(entry.label || entry.sourceName || ""));
  const resolvedAutomaticRule = (entry: ChannelCategorySetting) => {
    if (isCuratedChannelCategory(entry)) return { type: "manual" as const, value: "" };
    if (entry.ruleType && entry.ruleValue) return { type: entry.ruleType, value: String(entry.ruleValue) };
    const parent = parentCategoryFor(entry);
    if (parent && /브랜드/i.test(String(parent.label || parent.sourceName || ""))) {
      const brand = Array.from(new Set(allChannelCandidates.map((product) => String(product.brand || "").trim()).filter(Boolean)))
        .find((value) => value.toLowerCase() === String(entry.label || entry.sourceName || "").trim().toLowerCase()) || "";
      return { type: "brand" as const, value: brand };
    }
    const entryNames = [entry.label, entry.sourceName].map((value) => String(value || "").trim()).filter(Boolean);
    const category = categoryRuleNames.find((value) => entryNames.includes(value)) || "";
    return { type: "category" as const, value: category };
  };
  const productIdsForChannelCategory = (entry: ChannelCategorySetting) => {
    const cacheKey = String(entry.sourceName || entry.label || "");
    const cached = categoryProductIds.get(cacheKey);
    if (cached) return cached;
    const rule = resolvedAutomaticRule(entry);
    const ids = rule.type === "brand" && rule.value
      ? allChannelCandidates.filter((product) => Boolean(brandRuleCategory(entry))
        && matchesBrand(product.brand, rule.value)
        && String(product.category || "") === brandRuleCategory(entry)).map((product) => Number(product.id)).filter(Boolean)
      : rule.type === "category" && rule.value
        ? allChannelCandidates.filter((product) => productMatchesCategory(product, rule.value, globalCategoryConfig)).map((product) => Number(product.id)).filter(Boolean)
        : (entry.productIds || []).map(Number).filter(Boolean);
    categoryProductIds.set(cacheKey, ids);
    return ids;
  };
  const automaticProductIds = new Set(categoryOverrides.flatMap((entry) => resolvedAutomaticRule(entry).type !== "manual" ? productIdsForChannelCategory(entry) : []));
  const channelProducts = allChannelCandidates.filter((product) => Number(product.channel_linked || 0) === 1 || automaticProductIds.has(Number(product.id)));
  const legacyChannelCategories = globalCategoryConfig.categories
    .map((category, categoryIndex) => {
      const categoryOverride = overrideByName.get(category.name);
      const children = category.children
        .filter((child) => channelProducts.some((product) => productMatchesCategory(product, child.name, globalCategoryConfig)))
        .filter((child) => overrideByName.get(child.name)?.visible !== false)
        .sort((a, b) => (overrideByName.get(a.name)?.sortOrder ?? category.children.indexOf(a)) - (overrideByName.get(b.name)?.sortOrder ?? category.children.indexOf(b)))
        .map((child) => ({ ...child, sourceName: child.name, name: overrideByName.get(child.name)?.label || child.name }));
      const hasProducts = channelProducts.some((product) => productMatchesCategory(product, category.name, globalCategoryConfig));
      if (!hasProducts || categoryOverride?.visible === false) return null;
      return {
        ...category,
        sourceName: category.name,
        name: categoryOverride?.label || category.name,
        children,
        sortOrder: categoryOverride?.sortOrder ?? categoryIndex,
      };
    })
    .filter(Boolean)
    .sort((a, b) => Number(a?.sortOrder || 0) - Number(b?.sortOrder || 0))
    .map(({ sortOrder: _sortOrder, ...category }) => category);
  const categoryHasProducts = (entry: ChannelCategorySetting) => productIdsForChannelCategory(entry).length > 0;
  const customChannelCategories = categoryOverrides
    .filter((entry) => !entry.parentSourceName && entry.visible !== false)
    .filter((entry) => categoryHasProducts(entry) || categoryOverrides.some((child) => child.parentSourceName === entry.sourceName && child.visible !== false && categoryHasProducts(child)))
    .map((entry, index) => ({ id: entry.sourceName, sourceName: entry.sourceName, name: entry.label, visible: true, sortOrder: Number(entry.sortOrder ?? index), children: categoryOverrides.filter((child) => child.parentSourceName === entry.sourceName && child.visible !== false && categoryHasProducts(child)).sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0)).map((child) => ({ id: child.sourceName, sourceName: child.sourceName, name: child.label, visible: true, children: [] })) }))
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(({ sortOrder: _sortOrder, ...category }) => category);
  // Once a channel owner has created channel-specific menus, those menus are
  // the complete navigation for that channel. Legacy mall categories are only
  // a fallback for channels that have not configured their own navigation yet.
  const hasCustomChannelNavigation = categoryOverrides.some((entry) => !entry.parentSourceName);
  const channelCategories = hasCustomChannelNavigation ? customChannelCategories : legacyChannelCategories;
  const channelCategoryProductMap = Object.fromEntries(categoryOverrides
    .filter((entry) => entry.visible !== false && categoryHasProducts(entry))
    .map((entry) => {
      const automaticIds = productIdsForChannelCategory(entry);
      return [String(entry.label || entry.sourceName || ""), Array.from(new Set(automaticIds))];
    }));
  const channelCategoryCounts: Record<string, number> = Object.fromEntries(
    selectableCategoryNames(globalCategoryConfig).map((name) => [
      name,
      channelProducts.filter((product) => productMatchesCategory(product, name, globalCategoryConfig)).length,
    ]),
  );
  for (const [name, ids] of Object.entries(channelCategoryProductMap)) channelCategoryCounts[name] = ids.length;
  channelSettings.product_category_config = JSON.stringify({
    menuLimit: Math.max(5, Math.min(10, globalCategoryConfig.menuLimit)),
    categories: channelCategories,
  });
  channelSettings.channel_category_product_map = JSON.stringify(channelCategoryProductMap);
  const requestedCategoryIds = request.category === "전체"
    ? null
    : new Set((channelCategoryProductMap[request.category] || []).map(Number));
  const catalogCandidates = channelProducts.filter((product) => {
    if (requestedCategoryIds && !requestedCategoryIds.has(Number(product.id))) return false;
    if (!request.search) return true;
    return [product.name, product.style_number, product.product_code, product.brand]
      .some((value) => String(value || "").toLowerCase().includes(request.search));
  });
  const start = (request.page - 1) * request.limit;
  const pageIds = catalogCandidates.slice(start, start + request.limit).map((product) => Number(product.id));
  const linkedContentIds = new Set<number>();
  const collectProductIds = (value: unknown, key = "") => {
    if (Array.isArray(value)) {
      for (const item of value) collectProductIds(item, key);
      return;
    }
    if (value && typeof value === "object") {
      for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>)) collectProductIds(childValue, childKey);
      return;
    }
    if (/productids?|product_id/i.test(key)) {
      const id = Number(value);
      if (Number.isInteger(id) && id > 0) linkedContentIds.add(id);
    }
  };
  for (const key of ["youtube_live_product_ids", "youtube_live_slots", "youtube_replays", "youtube_shorts"]) {
    try { collectProductIds(JSON.parse(channelSettings[key] || "[]"), key); } catch { /* optional live settings */ }
  }
  const requiredIds = request.page === 1 && !request.search && request.category === "전체"
    ? [...linkedContentIds]
    : [];
  const fullProducts = await fullProductsByIds([...pageIds, ...requiredIds]);
  const candidateById = new Map(channelProducts.map((product) => [Number(product.id), product]));
  const products = fullProducts.map((product: any) => ({ ...candidateById.get(Number(product.id)), ...product }));
  return {
    channel,
    products,
    catalog: {
      items: pageIds.map((id) => products.find((product: any) => Number(product.id) === id)).filter(Boolean),
      total: catalogCandidates.length,
      page: request.page,
      pageSize: request.limit,
      category: request.category,
      search: request.search,
      categoryCounts: channelCategoryCounts,
    },
    otherChannels: otherChannels.results,
    settings: channelSettings,
  };
}

export async function getPublicProductChannelContext(channelId: number, productId: number) {
  if (!Number.isInteger(channelId) || channelId < 1 || !Number.isInteger(productId) || productId < 1) return null;
  await ensureSeedData();
  const row = await getD1()
    .prepare(
      `SELECT c.slug
       FROM sales_channels c
       JOIN sales_channel_products cp ON cp.channel_id = c.id
       JOIN products p ON p.id = cp.product_id
       WHERE c.id = ? AND cp.product_id = ? AND c.status = 'active' AND p.status = 'active'
       LIMIT 1`,
    )
    .bind(channelId, productId)
    .first<{ slug: string }>();
  return row?.slug ? getPublicChannel(String(row.slug), { trackView: false }) : null;
}

export async function getMemberAuthOptions() {
  await ensureSeedData();
  const rows = await getD1()
    .prepare(
      `SELECT key, value
       FROM settings
       WHERE key IN ('google_client_id', 'signup_code', 'brand_name', 'brand_tagline', 'logo_text', 'primary_color', 'secondary_color')`,
    )
    .all();
  const values = Object.fromEntries(
    rows.results.map((row) => [String(row.key), String(row.value)]),
  );
  return {
    googleClientId: String(values.google_client_id ?? "").trim(),
    signupCodeRequired: Boolean(String(values.signup_code ?? "").trim()),
    brandName: String(values.brand_name ?? defaultSettings.brand_name),
    brandTagline: String(values.brand_tagline ?? defaultSettings.brand_tagline),
    logoText: String(values.logo_text ?? defaultSettings.logo_text),
    primaryColor: String(values.primary_color ?? defaultSettings.primary_color),
    secondaryColor: String(values.secondary_color ?? defaultSettings.secondary_color),
  };
}

async function getProductDetail(productId: number, includeNonPublic: boolean) {
  await ensureSeedData();
  const db = getD1();
  const visibilityClause = includeNonPublic
    ? "p.status != 'deleted'"
    : "p.status = 'active'";
  const product = await db
    .prepare(
      `SELECT p.*, d.name_en, d.subcategory, d.product_type, d.type_fields_json,
        COALESCE((SELECT AVG(r.rating) FROM reviews r WHERE r.product_id = p.id AND r.visible = 1 AND r.deleted_at IS NULL), 0) AS rating,
        COALESCE((SELECT COUNT(*) FROM reviews r WHERE r.product_id = p.id AND r.visible = 1 AND r.deleted_at IS NULL), 0) AS review_count
       FROM products p
       LEFT JOIN product_catalog_details d ON d.product_id = p.id
       WHERE p.id = ? AND ${visibilityClause}`,
    )
    .bind(productId)
    .first<Record<string, unknown>>();
  if (!product) return null;
  const [reviews, questions, related, categoryRows, settingsRows] = await Promise.all([
    db
      .prepare(
        `SELECT r.*, m.name AS member_name, o.order_no, oi.selected_options
         FROM reviews r
         JOIN members m ON m.id = r.member_id
         LEFT JOIN orders o ON o.id = r.order_id
         LEFT JOIN order_items oi ON oi.id = r.order_item_id
         WHERE r.product_id = ? AND r.visible = 1 AND r.deleted_at IS NULL
         ORDER BY r.id DESC LIMIT 12`,
      )
      .bind(productId)
      .all(),
    db
      .prepare(
        `SELECT i.id, i.title, i.content, i.answer, i.status, i.created_at,
                i.answered_at, m.name AS member_name
         FROM inquiries i JOIN members m ON m.id = i.member_id
         WHERE i.product_id = ?
         ORDER BY i.id DESC LIMIT 20`,
      )
      .bind(productId)
      .all(),
    db
      .prepare(
        `SELECT id, name, image_url, point_price, category, brand
         FROM products
         WHERE status = 'active' AND category = ? AND id != ?
         ORDER BY sales_count DESC, id DESC LIMIT 4`,
      )
      .bind(String(product.category), productId)
      .all(),
    db
      .prepare(
        `SELECT category
         FROM products
         WHERE status = 'active'
         GROUP BY category
         ORDER BY MAX(id) DESC`,
      )
      .all(),
    db.prepare("SELECT key, value FROM settings").all(),
  ]);
  const settings = Object.fromEntries(
    settingsRows.results
      .filter((row) => String(row.key) !== "signup_code")
      .map((row) => [String(row.key), String(row.value)]),
  );
  const configuredCategories = parseCategoryConfig(
    settings.product_category_config,
    categoryRows.results.map((row) => String(row.category)),
  ).categories.filter((entry) => entry.visible).map((entry) => entry.name);
  return {
    product,
    reviews: reviews.results,
    questions: questions.results,
    related: related.results,
    categories: configuredCategories,
    settings,
  };
}

export async function getPublicProduct(productId: number) {
  return getProductDetail(productId, false);
}

export async function getAdminPreviewProduct(productId: number) {
  return getProductDetail(productId, true);
}

export async function ensureMember(user: RequestUser) {
  const db = getD1();
  const existing = await db
    .prepare("SELECT * FROM members WHERE email = ?")
    .bind(user.email)
    .first<Record<string, unknown>>();
  if (existing) {
    if (existing.role !== "member") {
      await db
        .prepare("UPDATE members SET role = 'member' WHERE id = ?")
        .bind(existing.id)
        .run();
      existing.role = "member";
    }
    return existing;
  }

  const joinedAt = nowIso();
  await db
    .prepare(
      `INSERT INTO members
        (email, name, role, status, points, charge_points, reward_points, phone, joined_at)
       VALUES (?, ?, ?, 'active', 0, 0, 0, '', ?)`,
    )
    .bind(user.email, user.name, "member", joinedAt)
    .run();

  const member = await db
    .prepare("SELECT * FROM members WHERE email = ?")
    .bind(user.email)
    .first<Record<string, unknown>>();
  return member;
}

export async function requireMember(request: Request) {
  await ensureSeedData();
  const { getNativeMemberFromHeaders } = await import("./member-auth");
  const nativeMember = await getNativeMemberFromHeaders(request.headers);
  if (nativeMember?.status === "active") return nativeMember;

  const { getRequestUser } = await import("./server");
  const user = getRequestUser(request);
  if (!user) return null;
  const member = await ensureMember(user);
  if (!member || member.status !== "active") return null;
  return member;
}

export async function requireAdmin(
  request: Request,
): Promise<AdminIdentity | null> {
  await ensureSeedData();
  const staffAdmin = await getStaffAdminFromHeaders(request.headers);
  if (staffAdmin) return staffAdmin;
  const { getRequestUser } = await import("./server");
  const user = getRequestUser(request);
  if (user && isAdminEmail(user.email, user.isPreview)) {
    const ownerAccount = await getD1()
      .prepare(
        `SELECT id, username, name
         FROM admin_accounts
         WHERE lower(username) = 'admin' AND status = 'active'
         LIMIT 1`,
      )
      .first<{ id: number; username: string; name: string }>();
    return {
      id: ownerAccount?.id ?? `owner:${user.email}`,
      name: ownerAccount?.name || "슈퍼바이저",
      username: ownerAccount?.username || "admin",
      authType: "owner",
      role: "supervisor",
      isSupervisor: true,
      permissions: [...SUPERVISOR_PERMISSIONS],
      forcePasswordChange: false,
    };
  }
  return null;
}
