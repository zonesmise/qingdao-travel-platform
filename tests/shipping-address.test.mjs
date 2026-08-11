import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const storeRoute = readFileSync(
  new URL("../app/api/store/route.ts", import.meta.url),
  "utf8",
);
const storefront = readFileSync(
  new URL("../components/Storefront.tsx", import.meta.url),
  "utf8",
);
const schema = readFileSync(
  new URL("../db/schema.ts", import.meta.url),
  "utf8",
);

test("shipping addresses are owned by the signed-in member", () => {
  assert.match(storeRoute, /shipping_addresses WHERE id = \? AND member_id = \?/);
  assert.match(storeRoute, /WHERE member_id = \?/);
  assert.match(schema, /shippingAddresses/);
  assert.match(schema, /shipping_addresses_member_idx/);
});

test("order address changes stop when fulfillment begins", () => {
  assert.match(storeRoute, /order\.address\.update/);
  assert.match(storeRoute, /order\.status !== "접수" && order\.status !== "결제확인대기"/);
  assert.match(storeRoute, /AND status IN \('결제확인대기', '접수'\)/);
  assert.match(storefront, /상품준비 이후 변경 제한/);
});

test("checkout and my page share the saved address book", () => {
  assert.match(storefront, /SHIPPING ADDRESS BOOK/);
  assert.match(storefront, /checkout-address-list/);
  assert.match(storefront, /address\.default/);
  assert.match(storefront, /address\.delete/);
  assert.match(storefront, /t1\.kakaocdn\.net/);
});
