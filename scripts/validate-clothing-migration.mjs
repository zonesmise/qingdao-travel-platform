import { readFile } from "node:fs/promises";
import { Miniflare } from "miniflare";

const migrationPath = process.argv[2];
const expected = Number(process.argv[3] || 0);
if (!migrationPath || !expected) {
  throw new Error("Usage: node scripts/validate-clothing-migration.mjs <migration> <expected-count>");
}

const source = await readFile(migrationPath, "utf8");
const styleNumbers = [...source.matchAll(/^\s*\('([^']+)',\s*'[^']+',\s*'[^']+',\s*'[^']+',\s*\d+\),?$/gm)]
  .map((match) => match[1]);
if (styleNumbers.length !== expected) {
  throw new Error(`Expected ${expected} product rows, found ${styleNumbers.length}`);
}

const mf = new Miniflare({
  modules: true,
  script: "export default { fetch() { return new Response('ok') } }",
  compatibilityDate: "2026-01-01",
  d1Databases: ["DB"],
});

try {
  const db = await mf.getD1Database("DB");
  await db.prepare(`CREATE TABLE products (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    name TEXT NOT NULL, category TEXT NOT NULL, brand TEXT DEFAULT '' NOT NULL,
    product_code TEXT DEFAULT '' NOT NULL, style_number TEXT DEFAULT '' NOT NULL,
    description TEXT NOT NULL, image_url TEXT NOT NULL, image_urls TEXT DEFAULT '[]' NOT NULL,
    media_json TEXT DEFAULT '[]' NOT NULL, options_json TEXT DEFAULT '[]' NOT NULL,
    variants_json TEXT DEFAULT '[]' NOT NULL, detail_content TEXT DEFAULT '' NOT NULL,
    shipping_info TEXT DEFAULT '' NOT NULL, point_price INTEGER NOT NULL,
    point_usage_mode TEXT DEFAULT 'full' NOT NULL, point_max_percent INTEGER DEFAULT 100 NOT NULL,
    cash_payment_enabled INTEGER DEFAULT 1 NOT NULL, reward_on_cash_only INTEGER DEFAULT 1 NOT NULL,
    stock INTEGER DEFAULT 0 NOT NULL, status TEXT DEFAULT 'active' NOT NULL,
    badge TEXT DEFAULT '' NOT NULL, sales_count INTEGER DEFAULT 0 NOT NULL, created_at TEXT NOT NULL
  )`).run();
  await db.prepare(`CREATE TABLE product_catalog_details (
    product_id INTEGER PRIMARY KEY NOT NULL, name_en TEXT DEFAULT '' NOT NULL,
    subcategory TEXT DEFAULT '' NOT NULL, product_type TEXT DEFAULT 'accessories' NOT NULL,
    sale_price INTEGER DEFAULT 0 NOT NULL, points_price INTEGER DEFAULT 0 NOT NULL,
    featured INTEGER DEFAULT 0 NOT NULL, type_fields_json TEXT DEFAULT '{}' NOT NULL,
    search_sources_json TEXT DEFAULT '[]' NOT NULL, thumbnail_url TEXT DEFAULT '' NOT NULL,
    source_kind TEXT DEFAULT 'manual' NOT NULL, source_reference TEXT DEFAULT '' NOT NULL,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  )`).run();

  const statements = source
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter(Boolean);
  for (const statement of statements) await db.prepare(statement).run();

  const placeholders = styleNumbers.map(() => "?").join(",");
  const countProducts = () => db
    .prepare(`SELECT COUNT(*) count FROM products WHERE style_number IN (${placeholders})`)
    .bind(...styleNumbers)
    .first();
  const first = Number((await countProducts()).count);

  for (const statement of statements) await db.prepare(statement).run();
  const afterRerun = Number((await countProducts()).count);
  if (first !== expected || afterRerun !== expected) {
    throw new Error(`Unexpected counts: first=${first}, afterRerun=${afterRerun}`);
  }
  console.log(JSON.stringify({ products: first, afterRerun }));
} finally {
  await mf.dispose();
}
