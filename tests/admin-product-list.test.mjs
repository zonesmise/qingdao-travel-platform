import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const dashboard = fs.readFileSync(new URL("../components/AdminDashboard.tsx", import.meta.url), "utf8");
const admin = fs.readFileSync(new URL("../app/api/admin/route.ts", import.meta.url), "utf8");
const data = fs.readFileSync(new URL("../lib/data.ts", import.meta.url), "utf8");
const editor = fs.readFileSync(new URL("../components/AdminProductEditor.tsx", import.meta.url), "utf8");

test("product management has explicit search, numeric pages and page-size choices", () => {
  assert.match(dashboard, /상품명·품번·상품코드 검색/);
  assert.match(dashboard, /admin-page-numbers/);
  for (const size of [20, 50, 100]) assert.match(dashboard, new RegExp(`value=\\{${size}\\}`));
});

test("only products selected on the current page can be bulk deleted", () => {
  assert.match(dashboard, /현재 페이지 상품 전체 선택/);
  assert.match(dashboard, /현재 페이지에서 선택한 상품/);
  assert.match(dashboard, /action: "product\.bulk_delete", ids: selected/);
  assert.match(admin, /action === "product\.bulk_delete"/);
  assert.match(admin, /selectedRows\.results\.length !== ids\.length/);
  assert.match(admin, /UPDATE products SET status = 'deleted'/);
});

test("catalog initialization never erases existing products", () => {
  assert.doesNotMatch(data, /DELETE FROM products/);
  assert.match(data, /if \(!hasProducts\)/);
  assert.match(data, /운영 중 상품이 하나라도/);
});

test("badges are customer-facing choices and review state is not a badge", () => {
  for (const label of ["신상품", "인기상품", "세일상품", "추천상품", "한정상품"]) {
    assert.match(editor, new RegExp(label));
  }
  assert.doesNotMatch(editor, /<option value="확인필요">/);
});
