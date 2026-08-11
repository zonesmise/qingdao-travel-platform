import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const admin = readFileSync(new URL("../app/api/admin/route.ts", import.meta.url), "utf8");
const dashboard = readFileSync(new URL("../components/AdminDashboard.tsx", import.meta.url), "utf8");
const storefront = readFileSync(new URL("../components/Storefront.tsx", import.meta.url), "utf8");
const categoryConfig = readFileSync(new URL("../lib/category-config.ts", import.meta.url), "utf8");

test("admin supports ordered visible categories and three category levels", () => {
  assert.match(dashboard, /PC 상단 노출 수/);
  assert.match(dashboard, /대분류 추가/);
  assert.match(dashboard, /중분류 추가/);
  assert.match(dashboard, /소분류 추가/);
  assert.match(dashboard, /updateGrandchild/);
  assert.match(dashboard, /catalog-visibility-control/);
  assert.match(dashboard, /moveCategory/);
});

test("categories with products cannot be deleted until products move", () => {
  assert.match(admin, /상품이 연결된 분류는 삭제할 수 없습니다/);
  assert.match(admin, /product\.category_move/);
  assert.match(dashboard, /상품 분류 일괄 이동/);
});

test("storefront honors menu limit, overflow, visibility and subcategories", () => {
  assert.match(storefront, /categoryConfig\.menuLimit - 1/);
  assert.match(storefront, /category-more/);
  assert.match(storefront, /category-subbar/);
  assert.match(storefront, /category-subbar-label/);
  assert.match(storefront, /\{selectedCategoryEntry\.name\} 전체/);
  assert.match(storefront, /entry\.visible/);
  assert.match(categoryConfig, /productMatchesCategory/);
  assert.match(categoryConfig, /StoreCategoryGrandchild/);
});

test("storefront uses home as the first main menu and keeps all-products inside the home experience", () => {
  assert.match(storefront, /\["홈", \.\.\.visibleMenuEntries/);
  assert.match(storefront, /selectStoreMenu\(item === "홈" \? "전체" : item\)/);
  assert.doesNotMatch(storefront, /\["전체", \.\.\.visibleMenuEntries/);
  assert.match(dashboard, /전체 쇼핑몰의 공식 상품 분류를 최대 3단계로 관리합니다/);
});

test("every category menu lands with the product section title below the sticky header", () => {
  assert.match(storefront, /function scrollSectionBelowHeader\(sectionId: string\)/);
  assert.match(storefront, /sectionTop - headerBottom - 14/);
  assert.match(storefront, /selectStoreMenu\(entry\.name\)/);
  assert.match(storefront, /isYoutubeSkin \? selectYoutubeCategory\(child\.name\) : selectStoreMenu\(child\.name\)/);
});

test("server validates saved and moved product category names", () => {
  assert.match(admin, /등록된 대분류를 선택해 주세요/);
  assert.match(admin, /선택한 대분류에 연결된 하위 분류를 선택해 주세요/);
  assert.match(admin, /이동할 새 분류가 현재 분류 목록에 없습니다/);
});

test("category moves repair missing legacy detail rows and verify no products remain", () => {
  assert.match(admin, /ON CONFLICT\(product_id\) DO UPDATE SET/);
  assert.match(admin, /remainingCount > 0/);
  assert.match(admin, /이전 분류에는 남은 상품이 없습니다/);
});

test("empty catalog categories hide automatically and can be hidden manually", () => {
  assert.match(dashboard, /categoryVisibilityControl/);
  assert.match(dashboard, /checked=\{empty \|\| manuallyHidden\}/);
  assert.match(dashboard, /disabled=\{empty\}/);
  assert.match(storefront, /entry\.visible && hasProducts\(entry\.name\)/);
  assert.match(storefront, /child\.visible && hasProducts\(child\.name\)/);
  assert.match(storefront, /grandchild\.visible && hasProducts\(grandchild\.name\)/);
});
