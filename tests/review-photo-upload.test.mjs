import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const storefront = fs.readFileSync(
  new URL("../components/Storefront.tsx", import.meta.url),
  "utf8",
);
const reviewImageRoute = fs.readFileSync(
  new URL("../app/api/review-image/route.ts", import.meta.url),
  "utf8",
);

test("review photos are previewed, optimized, removable, and reorderable", () => {
  assert.match(storefront, /URL\.createObjectURL\(file\)/);
  assert.match(storefront, /optimizeReviewPhoto/);
  assert.match(storefront, /review-photo-grid/);
  assert.match(storefront, /removeReviewPhoto/);
  assert.match(storefront, /moveReviewPhoto/);
  assert.match(storefront, /사진은 후기 등록 버튼을 누를 때 안전하게 업로드됩니다/);
});

test("successful photo reviews clear the detached form and prevent duplicate submits", () => {
  const reviewSubmit = storefront.slice(
    storefront.indexOf("async function reviewSubmit"),
    storefront.indexOf("async function couponSubmit"),
  );
  assert.match(reviewSubmit, /const formElement = event\.currentTarget/);
  assert.match(reviewSubmit, /new FormData\(formElement\)/);
  assert.match(reviewSubmit, /formElement\.reset\(\)/);
  assert.doesNotMatch(reviewSubmit, /event\.currentTarget\.reset\(\)/);
  assert.match(reviewSubmit, /reviewSubmitLockRef\.current = true/);
  assert.match(reviewSubmit, /reviewSubmitLockRef\.current = false/);
});

test("oversized non-JSON upload responses become a useful Korean message", () => {
  assert.match(storefront, /response\.status === 413/);
  assert.match(storefront, /payload too large/i);
  assert.match(storefront, /사진 용량이 서버 전송 한도를 넘었습니다/);
});

test("review image storage validates content and supports orphan cleanup", () => {
  assert.match(reviewImageRoute, /matchesImageSignature/);
  assert.match(reviewImageRoute, /export async function DELETE/);
  assert.match(reviewImageRoute, /await getR2\(\)\.delete\(key\)/);
  assert.match(reviewImageRoute, /MAX_IMAGE_BYTES = 900 \* 1024/);
});
