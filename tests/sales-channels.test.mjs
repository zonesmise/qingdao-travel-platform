import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const schema = readFileSync(new URL("../db/schema.ts", import.meta.url), "utf8");
const adminApi = readFileSync(new URL("../app/api/admin/route.ts", import.meta.url), "utf8");
const storeApi = readFileSync(new URL("../app/api/store/route.ts", import.meta.url), "utf8");
const admin = readFileSync(new URL("../components/AdminDashboard.tsx", import.meta.url), "utf8");
const storefront = readFileSync(new URL("../components/Storefront.tsx", import.meta.url), "utf8");
const globalCss = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const data = readFileSync(new URL("../lib/data.ts", import.meta.url), "utf8");
const channelRules = readFileSync(new URL("../lib/channel-category-rules.ts", import.meta.url), "utf8");

test("sales channels persist channel identity and product assignments", () => {
  assert.match(schema, /sqliteTable\("sales_channels"/);
  assert.match(schema, /sqliteTable\("sales_channel_products"/);
  assert.match(schema, /sales_channel_products_unique/);
  assert.match(schema, /broadcastSettings: text\("broadcast_settings"\)/);
  assert.match(schema, /categorySettings: text\("category_settings"\)/);
  assert.match(schema, /showcaseVisible: integer\("showcase_visible"/);
  assert.match(schema, /showcaseOrder: integer\("showcase_order"/);
  assert.match(schema, /channelId: integer\("channel_id"\)/);
  assert.match(schema, /channelName: text\("channel_name"\)/);
});

test("admin can create channels without enabling channel settlement", () => {
  assert.match(adminApi, /action === "channel\.save"/);
  assert.match(adminApi, /action === "channel\.delete"/);
  assert.match(adminApi, /action === "channel\.bootstrap"/);
  assert.match(admin, /판매 채널 관리/);
  assert.match(admin, /미리보기/);
  assert.match(admin, /새 채널 추가/);
  assert.match(admin, /방송 운영으로/);
});

test("active channel attribution is validated at checkout", () => {
  assert.match(storeApi, /requestedChannelId/);
  assert.match(storeApi, /c\.status = 'active'/);
  assert.match(storeApi, /sales_channel_products cp/);
  assert.match(storeApi, /attributedChannel\?\.name/);
});

test("channel cover uploads are resized before the hosting request limit", () => {
  assert.match(admin, /prepareChannelImage/);
  assert.match(admin, /CHANNEL_IMAGE_UPLOAD_TARGET = 850 \* 1024/);
  assert.match(admin, /canvas\.toBlob\(resolve, "image\/webp"/);
  assert.match(admin, /response\.status === 413/);
  assert.match(admin, /사진 용량이 너무 큽니다/);
  assert.match(admin, /cropChannelImage/);
  assert.match(admin, /대표 이미지.*편집/);
  assert.match(admin, /사진 크기/);
  assert.match(admin, /좌우 위치/);
  assert.match(admin, /상하 위치/);
});

test("supervisor controls deterministic other-channel visibility and order", () => {
  assert.match(admin, /channel-showcase-choice wide/);
  assert.match(admin, /isSupervisor && <fieldset/);
  assert.match(adminApi, /admin\.isSupervisor \? requestedShowcaseVisible/);
  assert.match(adminApi, /admin\.isSupervisor \? requestedShowcaseOrder/);
  assert.match(data, /c\.showcase_visible = 1/);
  assert.match(data, /ORDER BY c\.showcase_order, c\.sort_order, c\.id/);
});

test("storefront presents the expandable channel collection", () => {
  assert.match(storefront, /function ChannelShowcase/);
  assert.match(storefront, /오늘의 HOT 채널/);
  assert.match(storefront, /data\.salesChannels/);
});

test("public channel pages expose replays, shorts, products, and other channels", () => {
  const channelPage = readFileSync(new URL("../app/channel/[slug]/page.tsx", import.meta.url), "utf8");
  const productPage = readFileSync(new URL("../app/products/[id]/page.tsx", import.meta.url), "utf8");
  const productExperience = readFileSync(new URL("../components/ProductDetailExperience.tsx", import.meta.url), "utf8");
  assert.match(channelPage, /<Storefront initialData=/);
  assert.match(channelPage, /channelContext=/);
  assert.match(channelPage, /otherChannels/);
  assert.match(storefront, /Boolean\(channelContext\) \|\| data\?\.settings\?\.storefront_skin === "youtube"/);
  assert.match(storefront, /function YoutubeCommerceHome/);
  assert.match(storefront, /function OtherChannelShowcase/);
  assert.doesNotMatch(storefront, /<a href="#other-channels">다른 채널<\/a>/);
  assert.match(storefront, /다른 채널도 만나보세요/);
  assert.match(storefront, /영상 밖에서도 만나는 전체 상품/);
  assert.match(storefront, /channel-product-gallery/);
  assert.ok(storefront.indexOf('id="products"') < storefront.indexOf('id="other-channels"'));
  assert.match(storefront, /채널을 이동해도 장바구니와 리워드는 그대로 유지됩니다/);
  assert.match(storefront, /channel-brand-lockup/);
  assert.match(storefront, /channel-header-image/);
  assert.match(storefront, /의 라이브 쇼핑 채널/);
  assert.match(globalCss, /--channel-header-color/);
  assert.match(storefront, /scrollSubcategories/);
  assert.match(storefront, /category-scroll-button previous/);
  assert.match(storefront, /category-scroll-button next/);
  assert.match(globalCss, /scroll-snap-type: x proximity/);
  assert.match(storefront, /short-product-actions/);
  assert.match(storefront, /로그인 후 구매/);
  assert.match(storefront, /바로 구매/);
  assert.match(storefront, /연결 상품을 준비 중입니다/);
  assert.match(globalCss, /#purchase \{ scroll-margin-top:170px/);
  assert.match(storefront, /channels\.length > 2/);
  assert.match(storefront, /scrollBy/);
  assert.match(globalCss, /--channel-section-width: 1280px/);
  assert.match(globalCss, /grid-auto-flow: column/);
  assert.match(globalCss, /min-height: 680px/);
  assert.match(storefront, /totalPages > 1 \|\| Boolean\(channelContext\)/);
  assert.match(storefront, /현재 전체 상품/);
  assert.match(globalCss, /channel-product-gallery \+ \.other-channel-showcase \{ margin-top: 38px/);
  assert.match(globalCss, /youtube-live-stage > \* \{ width: min\(1280px, 100%\)/);
  assert.match(globalCss, /vertical-current-product \.video-product-card \{ grid-template-columns: 160px/);
  assert.match(globalCss, /youtube-vertical-live-grid \{ grid-template-columns: minmax\(320px, 340px\)/);
  assert.match(globalCss, /vertical-live-next \.video-product-card \{ grid-template-columns: 140px/);
  assert.match(globalCss, /aspect-ratio: 5 \/ 6/);
  assert.match(globalCss, /benefit-row\.youtube-benefits[\s\S]*padding: 28px/);
  assert.match(globalCss, /benefit-row:not\(\.youtube-benefits\)[\s\S]*padding: 28px/);
  assert.doesNotMatch(globalCss, /\.channel-product-gallery::before/);
  assert.doesNotMatch(globalCss, /border-top: 3px solid var\(--other-channel-color\)/);
  assert.match(productPage, /sourceChannelId/);
  assert.match(productExperience, /channelId: sourceChannelId/);
  assert.match(productPage, /getPublicProductChannelContext/);
  assert.match(productPage, /sourceChannel=/);
  assert.match(productExperience, /product-channel-header/);
  assert.match(productExperience, /channelCategories/);
  assert.match(productExperience, /채널로 돌아가기/);
  assert.match(globalCss, /product-channel-categories/);
});

test("live settings, live state, assistant, and replay analysis are channel scoped", () => {
  const liveState = readFileSync(new URL("../app/api/live-state/route.ts", import.meta.url), "utf8");
  const assistant = readFileSync(new URL("../components/LiveAssistant.tsx", import.meta.url), "utf8");
  const replayAnalysis = readFileSync(new URL("../app/api/youtube-replay-analysis/route.ts", import.meta.url), "utf8");
  assert.match(adminApi, /UPDATE sales_channels SET broadcast_settings/);
  assert.match(adminApi, /category_settings/);
  assert.match(admin, /채널 카테고리 만들기/);
  assert.match(admin, /상품을 가져올 카테고리를 선택하세요/);
  assert.match(admin, /현재 페이지 모두 가져오기/);
  assert.match(admin, /미분류 채널 상품/);
  assert.match(adminApi, /productIds: Array\.from\(new Set/);
  assert.match(adminApi, /parentSourceName/);
  assert.match(admin, /대메뉴로 만들기/);
  assert.match(admin, /아래 2단계로 만들기/);
  assert.match(data, /channel_category_product_map/);
  assert.match(storefront, /const channelProductIds = channelCategoryProductMap\[name\]/);
  assert.match(storefront, /catalog\?\.categoryCounts/);
  assert.match(storefront, /isYoutubeSkin && visibleCategoryEntries\.length > 0/);
  assert.doesNotMatch(storefront, /isYoutubeSkin && youtubeProductMenuEnabled && youtubeCategoriesOpen && <div className="youtube-category-strip open">/);
  assert.match(data, /hasCustomChannelNavigation \? customChannelCategories : legacyChannelCategories/);
  assert.match(admin, /전체 상품에서 채널 상품 가져오기/);
  assert.match(admin, /현재 채널 상품/);
  assert.match(admin, /productCategoryFilter/);
  assert.match(admin, /채널 상품 카테고리/);
  assert.match(admin, /채널 표시 이름/);
  assert.match(data, /channelSettings\.product_category_config/);
  assert.match(admin, /관리할 방송 채널/);
  assert.match(admin, /채널 홈/);
  assert.match(admin, /채널 상품·카테고리/);
  assert.match(admin, /assistantBasePath}\?channel=/);
  assert.match(liveState, /searchParams\.get\("channel"\)/);
  assert.match(assistant, /selectedChannel\?\.id/);
  assert.match(replayAnalysis, /channelId/);
});

test("cart and order items preserve channel attribution per product", () => {
  assert.match(schema, /export const carts[\s\S]*channelId: integer\("channel_id"\)/);
  assert.match(schema, /export const orderItems[\s\S]*channelId: integer\("channel_id"\)/);
  assert.match(storeApi, /JOIN sales_channel_products cp ON cp\.channel_id = c\.id/);
  assert.match(storeApi, /item\.channel_id \|\| null/);
});

test("channel categories hide empty menus automatically and support manual hiding", () => {
  assert.match(admin, /const empty = displayedCount === 0/);
  assert.match(admin, /checked=\{empty \|\| manuallyHidden\}/);
  assert.match(admin, /disabled=\{empty\}/);
  assert.match(admin, /visible: !event\.target\.checked/);
  assert.match(data, /categoryHasProducts/);
  assert.match(data, /child\.visible !== false && categoryHasProducts\(child\)/);
  assert.match(data, /entry\.visible !== false && categoryHasProducts\(entry\)/);
  assert.match(data, /hasCustomChannelNavigation \? customChannelCategories : legacyChannelCategories/);
  assert.match(globalCss, /channel-category-controls/);
});

test("channel brand categories require both product group and brand", () => {
  assert.match(admin, /ruleCategory\?: string/);
  assert.match(admin, /String\(product\.category \|\| ""\) === brandRuleCategory\(entry\)/);
  assert.match(admin, /연결할 상품군/);
  assert.match(adminApi, /ruleCategory: entry\.ruleType === "brand"/);
  assert.match(data, /Boolean\(brandRuleCategory\(entry\)\)/);
  assert.match(data, /String\(product\.category \|\| ""\) === brandRuleCategory\(entry\)/);
  assert.match(channelRules, /inferChannelBrandRuleCategory/);
  assert.match(channelRules, /brandMatchesChannelRule/);
  assert.match(channelRules, /canonicalBrandAliases/);
  assert.match(channelRules, /singleCategory\(selectedProducts/);
  assert.match(admin, /brandRuleCategory\(entry\)/);
  assert.match(data, /brandRuleCategory\(entry\)/);
  assert.match(data, /brandMatchesChannelRule\(productBrand, ruleBrand\)/);
  assert.match(data, /categoryOverrides\.some\(\(entry\) => !entry\.parentSourceName\)/);
  assert.match(data, /const categoryProductIds = new Map<string, number\[\]>\(\)/);
  assert.match(data, /categoryProductIds\.set\(cacheKey, ids\)/);
});

test("channel image editor saves the same extended position shown in preview", () => {
  assert.match(admin, /const offsetY = \(\(50 - settings\.positionY\) \/ 100\) \* canvas\.height/);
  assert.match(admin, /min="-50" max="150" value=\{activeCrop\.positionY\}/);
  assert.match(admin, /cropPositionLabel\(activeCrop\.positionY/);
  assert.match(admin, /channel-crop-help/);
});

test("each sales channel can override the mall contact counselor", () => {
  assert.match(schema, /contactSettings: text\("contact_settings"\)/);
  assert.match(adminApi, /contactSettingsJson/);
  assert.match(adminApi, /contact_settings = \?/);
  assert.match(admin, /channel-contact-settings wide/);
  assert.match(admin, /contact_counselor_name/);
  assert.match(data, /contactSettings\.use_channel_contact === "true"/);
  assert.match(storefront, /<FloatingContact settings=\{s\}/);
});

test("channel counselor photos open in a square editor before upload", () => {
  assert.match(admin, /상담자 사진 정사각형 편집/);
  assert.match(admin, /openCounselorImageEditor/);
  assert.match(admin, /cropChannelImage\(counselorCropFile, counselorCrop, 800, 800/);
  assert.match(admin, /실제 상담창에서는 원형으로 표시됩니다/);
});

test("the footer brand returns customers to the mall home", () => {
  assert.match(storefront, /className="brand-lockup footer-brand" href="\/"/);
  assert.match(storefront, /홈으로 이동/);
  assert.match(globalCss, /\.footer-brand:focus-visible/);
});

test("legacy channel categories recover automatic rules on customer pages", () => {
  assert.match(data, /const resolvedAutomaticRule/);
  assert.match(data, /categoryRuleNames\.find/);
  assert.match(data, /resolvedAutomaticRule\(entry\)\.type !== "manual"/);
  assert.match(data, /SELECT \$\{PRODUCT_LIST_COLUMNS\}/);
  assert.doesNotMatch(data.split("export async function getPublicChannel")[1].split("export async function getPublicProductChannelContext")[0], /SELECT p\.\*/);
  assert.match(data, /LEFT JOIN product_catalog_details d ON d\.product_id = p\.id/);
});
