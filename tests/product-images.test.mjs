import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const dataSource = fs.readFileSync(
  new URL("../lib/data.ts", import.meta.url),
  "utf8",
);
const safeImage = fs.readFileSync(
  new URL("../components/SafeProductImage.tsx", import.meta.url),
  "utf8",
);
const productEditor = fs.readFileSync(
  new URL("../components/AdminProductEditor.tsx", import.meta.url),
  "utf8",
);
const productUploadRoute = fs.readFileSync(
  new URL("../app/api/product-image/route.ts", import.meta.url),
  "utf8",
);
const adminRoute = fs.readFileSync(
  new URL("../app/api/admin/route.ts", import.meta.url),
  "utf8",
);
const productDetail = fs.readFileSync(
  new URL("../components/ProductDetailExperience.tsx", import.meta.url),
  "utf8",
);
const imageConsumers = [
  "../components/Storefront.tsx",
  "../components/ProductDetailExperience.tsx",
  "../components/AdminDashboard.tsx",
].map((path) => fs.readFileSync(new URL(path, import.meta.url), "utf8"));

test("fashion samples use image fallbacks and live slots are seeded only from shoes", () => {
  assert.match(dataSource, /catalog_version', '8'/);
  assert.match(dataSource, /sampleProduct\("NIKE", "신발"/);
  assert.match(dataSource, /sampleProduct\("ADIDAS", "가방"/);
  assert.match(dataSource, /sampleProduct\("ASICS", "의류"/);
  assert.match(dataSource, /WHERE category = '신발' AND status = 'active'/);
  assert.match(dataSource, /youtube_live_product_ids/);
  assert.match(dataSource, /reconcileCatalogReferences/);
  assert.match(dataSource, /UPDATE order_items SET product_id = \?, product_name = \?/);
});

test("product image surfaces hide the browser broken-image icon", () => {
  assert.match(safeImage, /onError/);
  assert.match(safeImage, /safe-product-image-fallback/);
  for (const consumer of imageConsumers) {
    assert.match(consumer, /SafeProductImage/);
  }
});

test("admin product studio uploads, previews, reorders and describes product photos", () => {
  assert.match(productEditor, /createImageBitmap/);
  assert.match(productEditor, /image\/webp/);
  assert.match(productEditor, /사진을 끌어놓거나 선택하세요/);
  assert.match(productEditor, /정확한 사진을 확보되는 만큼/);
  assert.match(productEditor, /1200×1200px · 1:1/);
  assert.match(productEditor, /readyMedia\.length < 1/);
  assert.match(adminRoute, /media\.length < 1/);
  assert.doesNotMatch(productEditor, /최소 5장/);
  assert.doesNotMatch(adminRoute, /최소 5장/);
  assert.match(productEditor, /대표지정/);
  assert.match(productEditor, /대체텍스트/);
  assert.match(productEditor, /임시저장/);
  assert.match(productEditor, /MAX_MEDIA = 12/);
  assert.match(productEditor, /pointPrice: String\(item\?\.point_price \?\? "999"\)/);
  assert.match(productEditor, /stock: String\(item\?\.stock \?\? "999"\)/);
});

test("product image upload is permission checked and stored outside the database", () => {
  assert.match(productUploadRoute, /canAdmin\(admin, "products"\)/);
  assert.match(productUploadRoute, /getR2\(\)\.put/);
  assert.match(productUploadRoute, /matchesImageSignature/);
  assert.match(productUploadRoute, /MAX_IMAGE_BYTES/);
});

test("ordered media metadata remains connected to legacy cover and gallery fields", () => {
  assert.match(adminRoute, /cleanProductMedia/);
  assert.match(adminRoute, /\^\\\/catalog\\\//);
  assert.match(adminRoute, /판매 저장 전 다음 항목을 확인해 주세요/);
  assert.match(adminRoute, /media_json/);
  assert.match(adminRoute, /JSON\.stringify\(galleryImages\)/);
  assert.match(productDetail, /productMedia\(product\)/);
  assert.match(productDetail, /entry\?\.alt/);
});
