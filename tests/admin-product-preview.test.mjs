import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const editor = fs.readFileSync(new URL("../components/AdminProductEditor.tsx", import.meta.url), "utf8");
const previewPage = fs.readFileSync(new URL("../app/admin/products/[id]/preview/page.tsx", import.meta.url), "utf8");
const productDetail = fs.readFileSync(new URL("../components/ProductDetailExperience.tsx", import.meta.url), "utf8");
const data = fs.readFileSync(new URL("../lib/data.ts", import.meta.url), "utf8");
const publicPage = fs.readFileSync(new URL("../app/products/[id]/page.tsx", import.meta.url), "utf8");

test("product editor opens the authenticated admin preview route", () => {
  assert.match(editor, /\/admin\/products\/\$\{item\.id\}\/preview/);
  assert.match(editor, /관리자 상품 미리보기 열기/);
  assert.doesNotMatch(editor, /href=\{`\/products\/\$\{item\.id\}`\}/);
});

test("admin preview is server-authorized and allows non-deleted products", () => {
  assert.match(previewPage, /getStaffAdminFromHeaders/);
  assert.match(previewPage, /canAdmin\(staffAdmin, "products"\)/);
  assert.match(previewPage, /isAdminEmail\(user\.email\)/);
  assert.match(previewPage, /getAdminPreviewProduct/);
  assert.match(data, /p\.status != 'deleted'/);
});

test("public product route remains active-only while preview purchase controls are locked", () => {
  assert.match(publicPage, /getPublicProduct/);
  assert.match(data, /p\.status = 'active'/);
  assert.match(productDetail, /관리자 전용 미리보기/);
  assert.match(productDetail, /Boolean\(adminPreview\)/);
});
