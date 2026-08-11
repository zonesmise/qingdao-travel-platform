import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const storeRoute = readFileSync(new URL("../app/api/store/route.ts", import.meta.url), "utf8");
const adminRoute = readFileSync(new URL("../app/api/admin/route.ts", import.meta.url), "utf8");
const storefront = readFileSync(new URL("../components/Storefront.tsx", import.meta.url), "utf8");
const migration = readFileSync(new URL("../drizzle/0022_overseas_direct_orders.sql", import.meta.url), "utf8");

test("personal customs code is encrypted and never returned as an admin/store field", () => {
  assert.match(storeRoute, /encryptPersonalValue/);
  assert.match(storeRoute, /customs_code_encrypted: _encrypted/);
  assert.match(adminRoute, /customs_code_encrypted: _encrypted/);
  assert.match(storefront, /customs_code_masked/);
});

test("orders keep an overseas delivery snapshot and support claims", () => {
  assert.match(migration, /delivery_stage/);
  assert.match(migration, /customs_code_encrypted/);
  assert.match(migration, /CREATE TABLE `order_claims`/);
  assert.match(storeRoute, /order\.claim\.request/);
  assert.match(storefront, /반품·교환 신청/);
});

test("the overseas order insert has the same number of columns and values", () => {
  const insert = storeRoute.match(/INSERT INTO orders\s*\(([\s\S]*?)\)\s*VALUES\s*\(([\s\S]*?)\)`/);
  assert.ok(insert, "orders insert SQL should exist");
  const columns = insert[1].split(",").map((value) => value.trim()).filter(Boolean);
  const values = insert[2].split(",").map((value) => value.trim()).filter(Boolean);
  assert.equal(values.length, columns.length);
});
