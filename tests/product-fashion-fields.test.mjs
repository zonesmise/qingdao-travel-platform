import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const specs = fs.readFileSync(new URL("../lib/product-specs.ts", import.meta.url), "utf8");
const editor = fs.readFileSync(new URL("../components/AdminProductEditor.tsx", import.meta.url), "utf8");
const admin = fs.readFileSync(new URL("../app/api/admin/route.ts", import.meta.url), "utf8");
const detail = fs.readFileSync(new URL("../components/ProductDetailExperience.tsx", import.meta.url), "utf8");
const data = fs.readFileSync(new URL("../lib/data.ts", import.meta.url), "utf8");
const store = fs.readFileSync(new URL("../app/api/store/route.ts", import.meta.url), "utf8");
const importedCatalog = fs.readFileSync(new URL("../lib/sku-draft-catalog.ts", import.meta.url), "utf8");
const importedSeed = fs.readFileSync(new URL("../lib/sku-draft-import.ts", import.meta.url), "utf8");

test("product registration supports shoes clothing bags belts wallets and accessories", () => {
  for (const value of ["shoes", "clothing", "bags", "belts", "wallets", "accessories"]) {
    assert.match(specs, new RegExp(`value: "${value}"`));
  }
  for (const label of ["사이즈 안내", "소재·혼용률", "스트랩", "벨트 폭", "수납 구성"]) {
    assert.match(specs, new RegExp(label));
  }
  assert.match(editor, /상품군별 상세정보/);
  assert.match(editor, /PRODUCT_SPEC_FIELDS\[values\.productType\]/);
  assert.match(editor, /영문 상품명/);
  assert.match(editor, /하위 분류/);
  assert.match(editor, /상품 코드 <em>필수<\/em>/);
  assert.match(editor, /품번 <em>필수<\/em>/);
  assert.match(editor, /styleNumber: String\(item\?\.style_number/);
  assert.match(admin, /!productCode && "상품코드"/);
  assert.match(admin, /!styleNumber && "품번"/);
  assert.match(admin, /이미 등록된 품번입니다/);
});

test("product-specific values are stored separately from the existing product record", () => {
  assert.match(admin, /INSERT INTO product_catalog_details/);
  assert.match(admin, /type_fields_json = excluded\.type_fields_json/);
  assert.match(admin, /cleanProductTypeFields/);
  assert.match(admin, /LEFT JOIN product_catalog_details d ON d\.product_id = p\.id/);
});

test("the public product page displays only completed product-specific rows", () => {
  assert.match(data, /d\.name_en, d\.subcategory, d\.product_type, d\.type_fields_json/);
  assert.match(detail, /productSpecRows/);
  assert.match(detail, /filter\(\(field\) => field\.value\)/);
  assert.match(detail, /상품 종류/);
  assert.match(detail, /영문 상품명/);
  assert.match(detail, /product\.style_number/);
  assert.match(detail, /<dt>상품 코드<\/dt>/);
  assert.match(detail, /<dt>품번<\/dt>/);
});

test("belt and wallet categories are added to the fashion catalog once", () => {
  assert.match(data, /\["신발", "가방", "의류", "벨트", "지갑"\]/);
  assert.match(data, /fashion_product_fields_version/);
});

test("the supplied SKU catalog is registered once as editable private drafts", () => {
  const raw = importedCatalog.match(/const RAW_SKUS = `([\s\S]*?)`;/)?.[1] || "";
  const skus = raw.trim().split(/\s+/).filter(Boolean);
  assert.equal(skus.length, 329);
  assert.equal(new Set(skus).size, 329);
  for (const sku of ["001A-W-HORIZON", "ZXSHM191305O", "HV8547-002", "XT-MM6"]) {
    assert.ok(skus.includes(sku));
  }
  assert.match(importedSeed, /999, 'draft', '', 0/);
  assert.match(importedSeed, /point_price = CASE WHEN point_price = 0 THEN 999 ELSE point_price END/);
  assert.match(importedSeed, /stock = CASE WHEN stock = 0 THEN 999 ELSE stock END/);
  assert.match(importedSeed, /UPDATE products SET badge = '' WHERE badge IN \('확인필요', '확인 필요'\)/);
  assert.match(importedSeed, /WHERE NOT EXISTS/);
  assert.match(importedSeed, /WHERE lower\(style_number\) = lower\(\?\)/);
  assert.match(importedCatalog, /VERIFIED_SKU_BATCH_1 = IMPORTED_SKU_DRAFTS\.slice\(0, 10\)\.map/);
  assert.match(importedSeed, /공급처 사진은 임시 참고자료로만 보관한다/);
  assert.match(importedSeed, /source_kind = 'user_sku_draft_import'/);
  assert.match(importedCatalog, /SUPPLIER_SKU_MEDIA/);
  assert.match(importedCatalog, /localSupplierMediaUrls/);
  assert.match(importedCatalog, /\/catalog\/supplier\//);
  assert.match(importedCatalog, /스카이샵 품번·상품사진 확인/);
  assert.match(importedSeed, /source_kind = 'verified_manual'/);
  assert.match(importedSeed, /SET style_number = \?, product_code = 'V2-' \|\| id/);
  assert.match(importedSeed, /WHERE lower\(style_number\) = lower\(\?\)/);
  assert.match(importedSeed, /image_url = \?, image_urls = \?, media_json = \?, detail_content = \?/);
  assert.match(importedSeed, /supplier_product_photo_import_incomplete/);
  assert.match(importedSeed, /image_url LIKE '\/catalog\/%' AND media_json != '\[\]'/);
  assert.match(importedCatalog, /Array\.from\(\{ length: 5 \}/);
  assert.match(importedCatalog, /detailContent: VERIFIED_BATCH_1_DETAILS/);
  assert.match(importedSeed, /width: 1200/);
  assert.match(importedSeed, /height: 1200/);
  assert.doesNotMatch(importedSeed, /WHERE lower\(product_code\) = lower\(\?\) AND status != 'deleted'/);
  for (const imageMarker of [
    "001A-HorizonLeadCropped",
    "0ZXSHM191305OBKX-pdp-1.jpg",
    "0ZXSHM307911PBKX-pdp-1.jpg",
    "10001-001_2.jpg",
    "/catalog/batch-1/1011B873-401.png",
    "/catalog/batch-1/1011B873-750.png",
  ]) assert.ok(importedCatalog.includes(imageMarker), `${imageMarker} image is registered`);
  for (const verified of ["BAPE STA #3 M1", "BAPE STA OS #2 M2", "수딩 씨\/블랙", "세이프티 옐로\/블랙"]) {
    assert.match(importedCatalog, new RegExp(verified));
  }
  assert.match(store, /LEFT JOIN product_catalog_details d ON d\.product_id = p\.id/);
  assert.doesNotMatch(data, /DELETE FROM products/);
});
