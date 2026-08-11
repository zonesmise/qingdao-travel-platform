import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const dashboard = readFileSync(new URL("../components/AdminDashboard.tsx", import.meta.url), "utf8");
const schema = readFileSync(new URL("../db/schema.ts", import.meta.url), "utf8");
const runtimeSchema = readFileSync(new URL("../lib/data.ts", import.meta.url), "utf8");
const backup = readFileSync(new URL("../app/api/admin/backup/route.ts", import.meta.url), "utf8");
const migration = readFileSync(new URL("../drizzle/0013_uneven_silhouette.sql", import.meta.url), "utf8");

test("AI model-number registration is absent from the admin and server routes", () => {
  assert.doesNotMatch(dashboard, /ai-products|AI 품번등록|AiProductRegistration/);
  assert.equal(existsSync(new URL("../components/AiProductRegistration.tsx", import.meta.url)), false);
  assert.equal(existsSync(new URL("../app/api/ai-products/route.ts", import.meta.url)), false);
  assert.equal(existsSync(new URL("../app/api/ai-products/import/route.ts", import.meta.url)), false);
  assert.equal(existsSync(new URL("../app/api/ai-product-image/route.ts", import.meta.url)), false);
  assert.equal(existsSync(new URL("../lib/product-search/index.ts", import.meta.url)), false);
});

test("temporary worklist and search cache are removed while registered products remain", () => {
  assert.doesNotMatch(schema, /aiProductTasks|productSearchCache|ai_product_tasks|product_search_cache/);
  assert.doesNotMatch(runtimeSchema, /ai_product_tasks|product_search_cache/);
  assert.doesNotMatch(backup, /ai_product_tasks|product_search_cache/);
  assert.match(migration, /DROP TABLE `ai_product_tasks`/);
  assert.match(migration, /DROP TABLE `product_search_cache`/);
  assert.match(schema, /export const products = sqliteTable\("products"/);
  assert.match(schema, /export const productCatalogDetails = sqliteTable/);
  assert.match(runtimeSchema, /CREATE TABLE IF NOT EXISTS products/);
  assert.match(runtimeSchema, /CREATE TABLE IF NOT EXISTS product_catalog_details/);
  assert.match(backup, /"products"/);
  assert.match(backup, /"product_catalog_details"/);
});
