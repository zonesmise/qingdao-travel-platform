import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const resultsPath = path.resolve("work", "results", "kickscrew-browser-results-2026-08-11.json");
const migrationPath = path.resolve("drizzle", "0037_register_kickscrew_matched_shoes.sql");
const reportPath = path.resolve("work", "results", "kickscrew-registration-2026-08-11.json");

const brandMap = new Map([
  ["NEW BALANCE", { brand: "뉴발란스 (New Balance)", ko: "뉴발란스" }],
  ["NIKE", { brand: "나이키 (Nike)", ko: "나이키" }],
  ["ASICS", { brand: "아식스 (ASICS)", ko: "아식스" }],
  ["ONITSUKA TIGER", { brand: "오니츠카타이거 (Onitsuka Tiger)", ko: "오니츠카타이거" }],
  ["ADIDAS", { brand: "아디다스 (adidas)", ko: "아디다스" }],
  ["SALOMON", { brand: "살로몬 (Salomon)", ko: "살로몬" }],
  ["HOKA ONE ONE", { brand: "호카 (HOKA)", ko: "호카" }],
  ["CROCS", { brand: "크록스 (Crocs)", ko: "크록스" }],
  ["ON RUNNING", { brand: "온 (On)", ko: "온" }],
  ["JORDAN", { brand: "조던 (Jordan)", ko: "조던" }],
]);

const sql = (value) => `'${String(value ?? "").replaceAll("'", "''")}'`;
const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();

function normalizeTitle(record) {
  const parts = String(record.title || "")
    .split("\n")
    .map(clean)
    .filter((part) => part && part !== "-");
  if (parts.length >= 2) return { rawBrand: parts[0], model: parts.slice(1).join(" ") };
  const oneLine = clean(parts[0]);
  const known = [...brandMap.keys()].find((key) => oneLine.toUpperCase().startsWith(`${key} `));
  return {
    rawBrand: known || oneLine.split(" ")[0],
    model: known ? oneLine.slice(known.length).trim() : oneLine,
  };
}

function normalizedImages(record) {
  const seen = new Set();
  const images = [];
  for (const entry of record.images || []) {
    const source = typeof entry === "string" ? entry : entry?.src;
    const alt = typeof entry === "string" ? "Product Image" : entry?.alt || "";
    if (!source || !source.includes("cdn.shopify.com")) continue;
    if (/loading_shimmer|authenticity|placeholder/i.test(source)) continue;
    if (!(/main product image|product image/i.test(alt) || /main-square/i.test(source))) continue;
    const key = source.replace(/_(?:\d+x\d*|\d+x)\.(jpg|jpeg|png|webp)/i, ".$1");
    if (seen.has(key)) continue;
    seen.add(key);
    images.push(source);
    if (images.length >= 12) break;
  }
  return images;
}

function subcategoryFor(model) {
  if (/trail|hiking|mountain|trek|speedgoat|mafate|kaha/i.test(model)) return "트레일·등산화";
  if (/sandal|slide|slipper|clog|mule/i.test(model)) return "샌들·슬리퍼";
  if (/boot|chelsea|chukka/i.test(model)) return "부츠";
  if (/running|runner|gel-kayano|gel-nimbus|novablast|vomero|pegasus|cloudmonster|clifton|bondi/i.test(model)) return "러닝화";
  return "스니커즈";
}

async function fetchImage(url, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/150 Safari/537.36",
          referer: "https://www.kickscrew.com/",
        },
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, attempt * 600));
    }
  }
  throw lastError;
}

const results = JSON.parse(await readFile(resultsPath, "utf8"));
const candidates = results
  .filter((record) => record.status === "matched")
  .map((record) => ({ ...record, sourceImages: normalizedImages(record) }))
  .filter((record) => record.sourceImages.length > 0);

const prepared = [];
const failures = [];
let cursor = 0;

async function worker() {
  while (cursor < candidates.length) {
    const index = cursor;
    cursor += 1;
    const record = candidates[index];
    const outputDir = path.resolve("public", "catalog", "shoes", record.sku);
    await rm(outputDir, { recursive: true, force: true });
    await mkdir(outputDir, { recursive: true });
    let saved = 0;
    for (const sourceUrl of record.sourceImages) {
      try {
        const input = await fetchImage(sourceUrl);
        saved += 1;
        await sharp(input, { failOn: "error" })
          .rotate()
          .flatten({ background: "#ffffff" })
          .resize(900, 900, { fit: "inside", withoutEnlargement: true })
          .webp({ quality: 78, effort: 4 })
          .toFile(path.join(outputDir, `${String(saved).padStart(2, "0")}.webp`));
      } catch (error) {
        failures.push({ sku: record.sku, sourceUrl, error: String(error?.message || error) });
      }
    }
    const files = (await readdir(outputDir)).filter((name) => name.endsWith(".webp"));
    if (files.length > 0) prepared.push({ ...record, imageCount: files.length });
    else await rm(outputDir, { recursive: true, force: true });
    process.stdout.write(`${index + 1}/${candidates.length} ${record.sku}: ${files.length} images\n`);
  }
}

await Promise.all(Array.from({ length: 8 }, () => worker()));
prepared.sort((a, b) => a.sku.localeCompare(b.sku));

const values = prepared.map((record) => {
  const { rawBrand, model } = normalizeTitle(record);
  const mapped = brandMap.get(rawBrand.toUpperCase()) || { brand: rawBrand, ko: rawBrand };
  const name = clean(`${mapped.ko} ${model.replace(new RegExp(`${record.sku}$`, "i"), "")}`);
  return `(${[
    sql(record.sku),
    sql(name),
    sql(clean(`${rawBrand} ${model}`)),
    sql(mapped.brand),
    sql(record.url),
    record.imageCount,
    sql(subcategoryFor(model)),
  ].join(", ")})`;
});

const migration = `WITH RECURSIVE
  image_numbers(value) AS (VALUES (1) UNION ALL SELECT value + 1 FROM image_numbers WHERE value < 12),
  shoes(style_number, name, name_en, brand, source_url, image_count, subcategory) AS (
    VALUES
      ${values.join(",\n      ")}
  )
INSERT INTO products
  (name, category, brand, product_code, style_number, description, image_url,
   image_urls, media_json, options_json, variants_json, detail_content, shipping_info,
   point_price, point_usage_mode, point_max_percent, cash_payment_enabled,
   reward_on_cash_only, stock, status, badge, sales_count, created_at)
SELECT
  shoes.name, '신발', shoes.brand, 'SHOES-' || shoes.style_number, shoes.style_number,
  'KICKS CREW 상품 상세페이지에서 품번 일치를 확인한 상품입니다.',
  '/catalog/shoes/' || shoes.style_number || '/01.webp',
  (SELECT json_group_array('/catalog/shoes/' || shoes.style_number || '/' || printf('%02d', image_numbers.value) || '.webp')
     FROM image_numbers WHERE image_numbers.value <= shoes.image_count),
  '[]', '[]', '[]',
  shoes.name || ' 상품입니다. KICKS CREW 검색 결과의 첫 번째 상품 상세페이지에서 품번이 정확히 일치하는 것을 확인했습니다.',
  '중국 판매자가 발송하고 플랫폼이 결제와 배송을 관리하는 해외직구 상품입니다. 통관 및 현지 배송 상황에 따라 배송 기간이 달라질 수 있습니다.',
  999, 'full', 100, 1, 1, 999, 'active', '', 0, datetime('now')
FROM shoes
WHERE NOT EXISTS (
  SELECT 1 FROM products WHERE lower(style_number) = lower(shoes.style_number) AND status != 'deleted'
);
--> statement-breakpoint
WITH shoes(style_number, name_en, source_url, image_count, subcategory) AS (
  VALUES
    ${prepared.map((record) => {
      const { rawBrand, model } = normalizeTitle(record);
      return `(${sql(record.sku)}, ${sql(clean(`${rawBrand} ${model}`))}, ${sql(record.url)}, ${record.imageCount}, ${sql(subcategoryFor(model))})`;
    }).join(",\n    ")}
)
INSERT INTO product_catalog_details
  (product_id, name_en, subcategory, product_type, sale_price, points_price,
   featured, type_fields_json, search_sources_json, thumbnail_url,
   source_kind, source_reference, created_at, updated_at)
SELECT
  products.id, shoes.name_en, shoes.subcategory, 'shoes', 999, 999, 0,
  json_object(), json_array(shoes.source_url), products.image_url,
  'kickscrew-exact-style-verified', shoes.source_url, datetime('now'), datetime('now')
FROM shoes
JOIN products ON lower(products.style_number) = lower(shoes.style_number)
WHERE products.status != 'deleted'
ON CONFLICT(product_id) DO UPDATE SET
  name_en = excluded.name_en,
  subcategory = excluded.subcategory,
  product_type = excluded.product_type,
  sale_price = excluded.sale_price,
  points_price = excluded.points_price,
  search_sources_json = excluded.search_sources_json,
  thumbnail_url = excluded.thumbnail_url,
  source_kind = excluded.source_kind,
  source_reference = excluded.source_reference,
  updated_at = excluded.updated_at;
`;

await writeFile(migrationPath, migration, "utf8");
await writeFile(
  reportPath,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      exactMatches: results.filter((record) => record.status === "matched").length,
      skippedByKicksCrewRule: results.filter((record) => record.status === "skip").length,
      skippedWithoutUsableImages: results.filter((record) => record.status === "matched" && normalizedImages(record).length === 0).map((record) => record.sku),
      prepared: prepared.map((record) => ({ sku: record.sku, imageCount: record.imageCount, url: record.url })),
      downloadFailures: failures,
    },
    null,
    2,
  ),
  "utf8",
);

process.stdout.write(`Prepared ${prepared.length} products; ${failures.length} image failures.\n`);
