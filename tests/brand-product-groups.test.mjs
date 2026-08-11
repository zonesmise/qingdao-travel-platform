import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const dashboard = await readFile(new URL("../components/AdminDashboard.tsx", import.meta.url), "utf8");
const editor = await readFile(new URL("../components/AdminProductEditor.tsx", import.meta.url), "utf8");
const adminApi = await readFile(new URL("../app/api/admin/route.ts", import.meta.url), "utf8");
const defaults = await readFile(new URL("../lib/data.ts", import.meta.url), "utf8");
const canonicalBrands = await readFile(new URL("../lib/canonical-brands.ts", import.meta.url), "utf8");

test("brand groups are persisted and inferred from existing products", () => {
  assert.match(defaults, /product_brand_groups/);
  assert.match(adminApi, /product_brand_groups/);
  assert.match(adminApi, /brandGroups/);
  assert.match(dashboard, /inferredBrandGroups/);
  assert.match(dashboard, /brand-group-matrix/);
});

test("brand management prevents normalized duplicates and uses one-at-a-time entry", () => {
  assert.match(adminApi, /cleanBrandList/);
  assert.match(adminApi, /normalize\("NFKC"\)/);
  assert.match(adminApi, /toLocaleUpperCase\("en-US"\)/);
  assert.match(dashboard, /brand-add-panel/);
  assert.match(dashboard, /이미 등록된 브랜드입니다/);
  assert.match(dashboard, /brandUsageCount/);
  assert.doesNotMatch(dashboard, /setBrandText/);
});

test("brand management can rename, merge, and move connected products", () => {
  assert.match(dashboard, /brandMoves/);
  assert.match(dashboard, /브랜드명 수정/);
  assert.match(dashboard, /중복 브랜드 합치기/);
  assert.match(dashboard, /연결 상품만 일괄 이동/);
  assert.match(adminApi, /UPDATE products SET brand = \?/);
  assert.match(adminApi, /allowedBrandKeys/);
});

test("deleted or intentionally removed brands are not restored on reopen", () => {
  assert.match(dashboard, /storedCatalogList\(s\.product_brands/);
  assert.match(dashboard, /data\.products\.filter\(\(product\) => product\.status !== "deleted"\)/);
});

test("the canonical Korean and English brand list can be applied idempotently", () => {
  assert.match(dashboard, /CANONICAL_PRODUCT_BRANDS/);
  assert.match(dashboard, /표준 브랜드 목록 적용/);
  assert.match(dashboard, /canonicalBrandAliases/);
  assert.match(canonicalBrands, /가니 \(GANNI\)/);
  assert.match(canonicalBrands, /휠라 \(FILA\)/);
});

test("product editor scopes brands to the selected top category", () => {
  assert.match(editor, /brandGroups\?: Record<string, string\[\]>/);
  assert.match(editor, /groups\.includes\(values\.category\)/);
  assert.match(editor, /scopedBrands\.map/);
});

test("channel catalog supports all filtered results without duplicate ids", () => {
  assert.match(dashboard, /function addAllFilteredProducts/);
  assert.match(dashboard, /검색 결과 전체 가져오기/);
  assert.match(dashboard, /Array\.from\(new Set\(\[\.\.\.existingCategoryIds, \.\.\.resultIds\]\)\)/);
});

test("channel brand and official category menus use automatic rules", () => {
  assert.match(dashboard, /function addAllFilteredProducts/);
  assert.match(dashboard, /브랜드·상품군 자동 연결/);
  assert.match(dashboard, /상품 분류 자동 연결/);
  assert.match(dashboard, /ruleType: isBrandCategory\(activeCategory\) \? "brand" : "category"/);
});

test("only curated recommendation and limited menus keep manual product selection", () => {
  assert.match(dashboard, /추천\|한정\|협업/);
  assert.match(dashboard, /직접 고르는 진열 메뉴/);
  assert.match(dashboard, /assignmentMode: "manual"/);
});
