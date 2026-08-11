import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const adminUi = await readFile(new URL("../components/AdminDashboard.tsx", import.meta.url), "utf8");
const productUi = await readFile(new URL("../components/AdminProductEditor.tsx", import.meta.url), "utf8");
const storefront = await readFile(new URL("../components/Storefront.tsx", import.meta.url), "utf8");
const storeApi = await readFile(new URL("../app/api/store/route.ts", import.meta.url), "utf8");
const adminApi = await readFile(new URL("../app/api/admin/route.ts", import.meta.url), "utf8");
const data = await readFile(new URL("../lib/data.ts", import.meta.url), "utf8");
const productDetail = await readFile(new URL("../components/ProductDetailExperience.tsx", import.meta.url), "utf8");
const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

test("all seven optional commerce modules have independent switches", () => {
  for (const key of ["feature_shipping_enabled", "feature_home_display_enabled", "feature_variant_stock_enabled", "feature_member_tiers_enabled", "feature_discount_enabled", "feature_templates_enabled", "feature_statistics_enabled"]) {
    assert.match(adminUi, new RegExp(key));
    assert.match(data, new RegExp(key));
  }
});

test("shipping and discounts are snapshotted into each order", () => {
  assert.match(storeApi, /subtotal_points, shipping_fee/);
  assert.match(storeApi, /discount_amount, coupon_id, benefit_snapshot/);
  assert.match(storefront, /최종 주문금액/);
});

test("variant stock supports per-combination price, sku, stock and restoration", () => {
  assert.match(productUi, /variant-stock-table/);
  assert.match(productUi, /additionalPrice/);
  assert.match(productUi, /sku/);
  assert.match(storeApi, /UPDATE products SET variants_json/);
  assert.match(adminApi, /restoredVariantStatements/);
});

test("member tiers add their configured reward rate", () => {
  assert.match(storeApi, /tier\?\.rewardRate/);
  assert.match(storefront, /member-tier-badge/);
});

test("discount coupons are claimed before checkout and consumed by an order", () => {
  assert.match(storeApi, /status = '보관'/);
  assert.match(storeApi, /status = '사용'.*coupon_type/s);
  assert.match(adminUi, /주문금액 할인/);
});

test("home sections and order messages are customer-visible only when enabled", () => {
  assert.match(storefront, /feature_home_display_enabled/);
  assert.match(storefront, /feature_templates_enabled/);
  assert.match(storefront, /home-display-section/);
  assert.match(storefront, /order-status-message/);
});

test("the operations screen exposes thirty-day commerce metrics", () => {
  assert.match(adminApi, /orders30/);
  assert.match(adminApi, /returnRate30/);
  assert.match(adminUi, /최근 30일 주문/);
});

test("catalog presents products as reward-commerce prices instead of legacy point-only prices", () => {
  assert.match(storefront, /productCardMeta/);
  assert.match(storefront, /<em>원<\/em>/);
  assert.match(storefront, /최대 \{fmt\(cardMeta\.rewardPoints\)\}/);
  assert.match(storefront, /배송비 주문서 확인/);
  assert.match(productUi, /판매가 <em>필수<\/em>/);
  assert.match(adminUi, /<th>판매가<\/th>/);
  assert.match(productDetail, /<dt>판매가<\/dt>/);
  assert.match(productDetail, /<dt>결제 혜택<\/dt>/);
});

test("member and admin navigation expose one unified reward center", () => {
  assert.match(storefront, /\["reward", "리워드"\]/);
  assert.doesNotMatch(storefront, /\["points", "포인트"\]/);
  assert.match(adminUi, /\["rewards", "R", "리워드 관리"\]/);
  assert.doesNotMatch(adminUi, /\["points", "P", "포인트 내역"\]/);
  assert.match(adminUi, /<Points rows=\{data\.pointLogs\}/);
});

test("mobile catalog keeps one clear purchase action and concise benefit metadata", () => {
  const catalogCards = storefront.match(/<article className="product-card"[\s\S]*?<\/article>/)?.[0] || "";
  assert.doesNotMatch(catalogCards, />상품보기<\/a>/);
  assert.match(catalogCards, /className="product-card-actions"/);
  assert.match(catalogCards, /최대 \{fmt\(cardMeta\.rewardPoints\)\}/);
  assert.match(styles, /\.product-info\s*>\s*p\s*\{\s*display:none;/);
  assert.match(styles, /\.price-line\s*\{\s*min-height:29px;\s*align-content:flex-start;/);
});
