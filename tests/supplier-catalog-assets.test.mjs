import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import sharp from "sharp";
import { IMPORTED_SKU_DRAFTS, VERIFIED_SKU_BATCH_1 } from "../lib/sku-draft-catalog.ts";
import { PAGE_1_DRAFTS, PAGE_1_REVIEW_PENDING_SKUS, PAGE_1_VERIFIED_DRAFTS } from "../lib/catalog-page-1.ts";
import { ALL_PAGES_VERIFIED_DRAFTS } from "../lib/catalog-pages-1-19.ts";
import { SUPPLIER_SKU_MEDIA } from "../lib/yupoo-sku-media.ts";

test("all matched supplier photos are stored and referenced as local catalog assets", () => {
  const matchedSkus = Object.keys(SUPPLIER_SKU_MEDIA);
  const expectedPhotoCount = Object.values(SUPPLIER_SKU_MEDIA)
    .reduce((total, item) => total + item.mediaUrls.length, 0);
  const importedBySku = new Map(IMPORTED_SKU_DRAFTS.map((item) => [item.sku, item]));

  assert.equal(matchedSkus.length, 326);
  assert.equal(expectedPhotoCount, 647);

  let localPhotoCount = 0;
  for (const sku of matchedSkus) {
    const product = importedBySku.get(sku);
    assert.ok(product, `${sku} is missing from imported products`);
    assert.equal(product.mediaUrls.length, SUPPLIER_SKU_MEDIA[sku].mediaUrls.length);

    for (const url of product.mediaUrls) {
      assert.match(url, /^\/catalog\/supplier\/[a-z0-9-]+\/\d{2}\.webp$/);
      const file = new URL(`../public${url}`, import.meta.url);
      assert.ok(fs.existsSync(file), `${sku} photo is missing: ${url}`);
      assert.ok(fs.statSync(file).size > 1_000, `${sku} photo is empty: ${url}`);
      localPhotoCount += 1;
    }
  }

  assert.equal(localPhotoCount, 647);
});

test("verified gallery products are checked against multiple independent sites", () => {
  for (const product of VERIFIED_SKU_BATCH_1) {
    const domains = new Set((product.sourceUrls || []).map(({ url }) =>
      new URL(url).hostname.replace(/^www\./, ""),
    ));
    assert.ok(domains.size >= 2, `${product.sku} needs at least two source domains`);
    assert.match(product.sourceNote || "", /배경 없는 사진/);
  }
});

test("page-one additions contain only locally stored verified web photos", () => {
  assert.equal(PAGE_1_DRAFTS.length, 68);
  assert.equal(PAGE_1_VERIFIED_DRAFTS.length, 52);
  assert.equal(PAGE_1_REVIEW_PENDING_SKUS.length, 16);
  assert.equal(new Set(PAGE_1_DRAFTS.map((item) => item.sku.toLowerCase())).size, 68);
  assert.equal(new Set(PAGE_1_VERIFIED_DRAFTS.map((item) => item.sku.toLowerCase())).size, 52);
  for (const pendingSku of PAGE_1_REVIEW_PENDING_SKUS) {
    const pending = PAGE_1_DRAFTS.find((item) => item.sku.toLowerCase() === pendingSku.toLowerCase());
    assert.ok(pending, `${pendingSku} is missing from page-one drafts`);
    assert.equal(pending.mediaUrls?.length || 0, 0, `${pendingSku} must not reuse supplier photos`);
  }

  let photoCount = 0;
  for (const product of PAGE_1_VERIFIED_DRAFTS) {
    const domains = new Set((product.sourceUrls || []).map(({ url }) =>
      new URL(url).hostname.replace(/^www\./, ""),
    ));
    assert.ok(domains.size >= 2, `${product.sku} needs at least two evidence domains`);
    assert.ok(product.mediaUrls.length >= 1 && product.mediaUrls.length <= 12);
    assert.match(product.sourceNote || "", /웹 상품사진 사용/);
    for (const url of product.mediaUrls) {
      assert.match(url, /^\/catalog\/web-verified\/page-1\/[a-z0-9-]+\/\d{2}\.webp$/);
      const file = new URL(`../public${url}`, import.meta.url);
      assert.ok(fs.existsSync(file), `${product.sku} photo is missing: ${url}`);
      assert.ok(fs.statSync(file).size > 1_000, `${product.sku} photo is empty: ${url}`);
      photoCount += 1;
    }
  }

  assert.equal(photoCount, 221);
});

test("DN1791-116 uses verified Korean product content", () => {
  const product = PAGE_1_DRAFTS.find((item) => item.sku === "DN1791-116");
  assert.ok(product);
  assert.equal(product.nameKo, "나이키 여성 코르테즈 레더 세일 실트 레드");
  assert.match(product.description || "", /여성용 로우탑 스니커즈/);
  assert.match(product.description || "", /레더 갑피와 폼 미드솔/);
  assert.equal(product.detailContent, product.description);
});

test("all-page additions contain only locally stored multi-source verified photos", async () => {
  assert.equal(ALL_PAGES_VERIFIED_DRAFTS.length, 27);
  assert.equal(new Set(ALL_PAGES_VERIFIED_DRAFTS.map((item) => item.sku.toLowerCase())).size, 27);

  let photoCount = 0;
  for (const product of ALL_PAGES_VERIFIED_DRAFTS) {
    const evidenceDomains = new Set((product.sourceUrls || [])
      .map(({ url }) => new URL(url).hostname.replace(/^www\./, ""))
      .filter((domain) => !domain.endsWith("yupoo.com")));
    assert.ok(evidenceDomains.size >= 2, `${product.sku} needs at least two external evidence domains`);
    assert.ok(product.mediaUrls.length >= 2 && product.mediaUrls.length <= 12);
    assert.match(product.sourceNote || "", /고화질 사진 사용/);
    assert.match(product.sourceNote || "", /배경 제거 또는 흰 배경 사진 우선/);

    for (const url of product.mediaUrls) {
      assert.match(url, /^\/catalog\/web-verified\/pages-1-19\/[a-z0-9-]+\/\d{2}\.webp$/);
      const file = new URL(`../public${url}`, import.meta.url);
      assert.ok(fs.existsSync(file), `${product.sku} photo is missing: ${url}`);
      assert.ok(fs.statSync(file).size > 1_000, `${product.sku} photo is empty: ${url}`);
      const metadata = await sharp(fileURLToPath(file)).metadata();
      assert.equal(metadata.width, 1_200, `${product.sku} photo width is not normalized: ${url}`);
      assert.equal(metadata.height, 1_200, `${product.sku} photo height is not normalized: ${url}`);
      photoCount += 1;
    }
  }

  assert.equal(photoCount, 105);
});
