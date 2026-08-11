import { PAGE_1_REVIEW_PENDING_SKUS, PAGE_1_VERIFIED_DRAFTS } from "./catalog-page-1";
import { ALL_PAGES_REVIEW_PENDING_SKUS, ALL_PAGES_VERIFIED_DRAFTS } from "./catalog-pages-1-19";
import { IMPORTED_SKU_DRAFTS, VERIFIED_SKU_BATCH_1, type ImportedSkuDraft } from "./sku-draft-catalog";

const IMPORT_VERSION = "2026-08-02-v14-dn1791-116-korean-content";
const IMPORT_SETTING_KEY = "user_sku_draft_import_version";
const CHUNK_SIZE = 30;

function chunks<T>(items: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

function draftTypeFields(item: ImportedSkuDraft) {
  return JSON.stringify({
    ...(item.officialColor ? { officialColor: item.officialColor } : {}),
    ...(item.gender ? { gender: item.gender } : {}),
    ...(item.material ? { material: item.material } : {}),
    ...(item.sizeGuide ? { sizeGuide: item.sizeGuide } : {}),
    ...(item.releaseDate ? { releaseDate: item.releaseDate } : {}),
    ...(item.countryOfOrigin ? { countryOfOrigin: item.countryOfOrigin } : {}),
  });
}

function draftSources(item: ImportedSkuDraft) {
  if (item.sourceUrls?.length) return JSON.stringify(item.sourceUrls);
  if (item.sourceUrl) return JSON.stringify([{ url: item.sourceUrl, label: "상품정보 확인 출처" }]);
  return "[]";
}

function draftDescription(item: ImportedSkuDraft) {
  if (item.description) return item.description;
  return [
    item.nameKo,
    `품번 ${item.sku} 기준으로 만든 비공개 임시상품입니다.`,
    item.sourceNote || "판매 전 공식 상품명·색상·사이즈를 한 번 더 확인해 주세요.",
  ].join(" ");
}

function draftMedia(item: ImportedSkuDraft) {
  const urls = item.mediaUrls?.length
    ? item.mediaUrls
    : item.imageUrl
      ? [item.imageUrl]
      : [];
  return JSON.stringify(urls.map((url, index) => ({
    url,
    alt: `${item.nameKo} ${index === 0 ? "대표사진" : `${index + 1}번째 상품사진`}`,
    width: 1200,
    height: 1200,
  })));
}

function catalogSubcategory(value: string) {
  if (value.includes("러닝화")) return "러닝화";
  if (value.includes("스니커즈")) return "스니커즈";
  if (value.includes("클로그")) return "클로그";
  if (value.includes("부츠")) return "부츠";
  if (value.includes("슬립온")) return "슬립온";
  if (value.includes("샌들") || value.includes("슬리퍼")) return "샌들·슬리퍼";
  return value;
}

function draftCategory(item: ImportedSkuDraft) {
  return item.category || "신발";
}

function draftProductType(item: ImportedSkuDraft) {
  return item.productType || "shoes";
}

export async function ensureUserSkuDraftImport(db: D1Database, now: string) {
  const completed = await db
    .prepare("SELECT value FROM settings WHERE key = ?")
    .bind(IMPORT_SETTING_KEY)
    .first<{ value: string }>();
  if (completed?.value === IMPORT_VERSION) return;

  // 2026-08-02에 품번이 상품코드 칸에 잘못 들어간 임시상품만 바로잡는다.
  // 사용자가 직접 수정한 다른 상품코드는 건드리지 않는다.
  for (const group of chunks(IMPORTED_SKU_DRAFTS, CHUNK_SIZE)) {
    await db.batch(group.map((item) => db.prepare(
      `UPDATE products
       SET style_number = ?, product_code = 'V2-' || id
       WHERE lower(product_code) = lower(?)
         AND style_number = ''
         AND id IN (
           SELECT product_id FROM product_catalog_details
           WHERE source_kind IN ('user_sku_draft_import', 'verified_manual')
         )`,
    ).bind(item.sku, item.sku)));
  }

  for (const group of chunks(IMPORTED_SKU_DRAFTS, CHUNK_SIZE)) {
    const statements: D1PreparedStatement[] = [];
    for (const item of group) {
      const typeFields = draftTypeFields(item);
      const sourceList = draftSources(item);
      const description = draftDescription(item);

      statements.push(
        db.prepare(
          `INSERT INTO products
            (name, category, brand, product_code, style_number, description, image_url,
             image_urls, media_json, options_json, variants_json, detail_content, shipping_info,
             point_price, point_usage_mode, point_max_percent,
             cash_payment_enabled, reward_on_cash_only,
             stock, status, badge, sales_count, created_at)
           SELECT ?, ?, ?, ?, ?, ?, ?, '[]', ?, '[]', '[]', '', '',
             999, 'full', 100, 1, 1, 999, 'draft', '', 0, ?
           WHERE NOT EXISTS (
             SELECT 1 FROM products
             WHERE lower(style_number) = lower(?)
           )`,
        ).bind(
          item.nameKo,
          draftCategory(item),
          item.brand,
          `V2-PENDING-${item.sku}`,
          item.sku,
          description,
          item.imageUrl || "",
          draftMedia(item),
          now,
          item.sku,
        ),
      );
      statements.push(
        db.prepare(
          `INSERT OR IGNORE INTO product_catalog_details
            (product_id, name_en, subcategory, product_type, sale_price, points_price,
             featured, type_fields_json, search_sources_json, thumbnail_url,
             source_kind, source_reference, created_at, updated_at)
           SELECT id, ?, ?, ?, 0, 0, 0, ?, ?, '',
             'user_sku_draft_import', ?, ?, ?
           FROM products
           WHERE lower(style_number) = lower(?) AND status != 'deleted'
           ORDER BY id DESC LIMIT 1`,
        ).bind(
          item.nameEn,
          catalogSubcategory(item.subcategory),
          draftProductType(item),
          typeFields,
          sourceList,
          item.sourceNote || "사용자 제공 품번 목록 2026-08-02",
          now,
          now,
          item.sku,
        ),
      );
      statements.push(
        db.prepare(
          `UPDATE product_catalog_details
           SET subcategory = ?, updated_at = ?
           WHERE source_kind = 'user_sku_draft_import'
             AND product_id = (
               SELECT id FROM products
               WHERE lower(style_number) = lower(?) AND status != 'deleted'
               ORDER BY id DESC LIMIT 1
             )`,
        ).bind(catalogSubcategory(item.subcategory), now, item.sku),
      );
    }
    await db.batch(statements);
  }

  await db.prepare(
    `UPDATE products
     SET product_code = 'V2-' || id
     WHERE product_code LIKE 'V2-PENDING-%'`,
  ).run();

  // 공급처 사진은 임시 참고자료로만 보관한다. 다중 출처 검수 전에는 완료 자료로 표시하지 않는다.
  // 관리자에서 직접 수정한 상품(source_kind = manual)과 1차 검증 완료 상품은 덮어쓰지 않는다.
  for (const group of chunks(IMPORTED_SKU_DRAFTS, CHUNK_SIZE)) {
    const statements: D1PreparedStatement[] = [];
    for (const item of group) {
      statements.push(
        db.prepare(
          `UPDATE products
           SET name = ?, category = ?, brand = ?, description = ?,
               image_url = ?, image_urls = ?, media_json = ?, detail_content = ?
           WHERE lower(style_number) = lower(?) AND status != 'deleted'
             AND id IN (
               SELECT product_id FROM product_catalog_details
               WHERE source_kind = 'user_sku_draft_import'
             )`,
        ).bind(
          item.nameKo,
          draftCategory(item),
          item.brand,
          draftDescription(item),
          item.imageUrl || "",
          JSON.stringify((item.mediaUrls || []).slice(1)),
          draftMedia(item),
          item.detailContent || draftDescription(item),
          item.sku,
        ),
      );
      statements.push(
        db.prepare(
          `UPDATE product_catalog_details
           SET name_en = ?, subcategory = ?, product_type = ?,
               type_fields_json = ?, search_sources_json = ?,
               thumbnail_url = ?, source_reference = ?, updated_at = ?
           WHERE source_kind = 'user_sku_draft_import'
             AND product_id = (
               SELECT id FROM products
               WHERE lower(style_number) = lower(?) AND status != 'deleted'
               ORDER BY id DESC LIMIT 1
             )`,
        ).bind(
          item.nameEn,
          catalogSubcategory(item.subcategory),
          draftProductType(item),
          draftTypeFields(item),
          draftSources(item),
          item.imageUrl || "",
          item.sourceNote || "사용자 제공 품번과 공급처 카탈로그 대조 완료",
          now,
          item.sku,
        ),
      );
    }
    await db.batch(statements);
  }

  // 아직 실제 가격·재고가 입력되지 않은 품번 임시상품만 관리용 기본값으로 채운다.
  // 이미 관리자가 수정한 0이 아닌 값은 덮어쓰지 않는다.
  await db.prepare(
    `UPDATE products
     SET point_price = CASE WHEN point_price = 0 THEN 999 ELSE point_price END,
         stock = CASE WHEN stock = 0 THEN 999 ELSE stock END
     WHERE id IN (
       SELECT product_id FROM product_catalog_details
       WHERE source_kind IN ('user_sku_draft_import', 'verified_manual')
     )
       AND (point_price = 0 OR stock = 0)`,
  ).run();

  await db.prepare(
    `UPDATE product_catalog_details
     SET sale_price = CASE WHEN sale_price = 0 THEN 999 ELSE sale_price END,
         points_price = CASE WHEN points_price = 0 THEN 999 ELSE points_price END,
         updated_at = ?
     WHERE source_kind IN ('user_sku_draft_import', 'verified_manual')
       AND (sale_price = 0 OR points_price = 0)`,
  ).bind(now).run();

  // 첫 10개는 공식 상품정보까지 별도로 확인한 로컬 갤러리를 우선 유지한다.
  // 판매가·재고·공개상태는 덮어쓰지 않는다.
  for (const group of chunks(VERIFIED_SKU_BATCH_1, 10)) {
    const statements: D1PreparedStatement[] = [];
    for (const item of group) {
      statements.push(
        db.prepare(
          `UPDATE products
           SET name = ?, category = '신발', brand = ?, description = ?,
               image_url = ?, image_urls = ?, media_json = ?, detail_content = ?
           WHERE lower(style_number) = lower(?) AND status != 'deleted'`,
        ).bind(
          item.nameKo,
          item.brand,
          draftDescription(item),
          item.imageUrl || "",
          JSON.stringify((item.mediaUrls || []).slice(1)),
          draftMedia(item),
          item.detailContent || draftDescription(item),
          item.sku,
        ),
      );
      statements.push(
        db.prepare(
          `UPDATE product_catalog_details
           SET name_en = ?, subcategory = ?, product_type = 'shoes',
               type_fields_json = ?, search_sources_json = ?,
               thumbnail_url = ?,
               source_kind = 'verified_manual', source_reference = ?, updated_at = ?
           WHERE product_id = (
             SELECT id FROM products
             WHERE lower(style_number) = lower(?) AND status != 'deleted'
             ORDER BY id DESC LIMIT 1
           )`,
        ).bind(
          item.nameEn,
          catalogSubcategory(item.subcategory),
          draftTypeFields(item),
          draftSources(item),
          item.imageUrl || "",
          item.sourceNote || "직접 조사 1차 확인 완료",
          now,
          item.sku,
        ),
      );
    }
    await db.batch(statements);
  }

  // 추가 페이지에서 중복을 제외하고 웹 다중 출처 검증을 마친 상품만 완료 자료로 승격한다.
  // 기존 관리자가 정한 판매가·재고·공개상태는 변경하지 않는다.
  for (const group of chunks([...PAGE_1_VERIFIED_DRAFTS, ...ALL_PAGES_VERIFIED_DRAFTS], 10)) {
    const statements: D1PreparedStatement[] = [];
    for (const item of group) {
      statements.push(
        db.prepare(
          `UPDATE products
           SET name = ?, category = ?, brand = ?, description = ?,
               image_url = ?, image_urls = ?, media_json = ?, detail_content = ?
           WHERE lower(style_number) = lower(?) AND status != 'deleted'
             AND id IN (
               SELECT product_id FROM product_catalog_details
               WHERE source_kind = 'user_sku_draft_import'
             )`,
        ).bind(
          item.nameKo,
          draftCategory(item),
          item.brand,
          draftDescription(item),
          item.imageUrl || "",
          JSON.stringify((item.mediaUrls || []).slice(1)),
          draftMedia(item),
          item.detailContent || draftDescription(item),
          item.sku,
        ),
      );
      statements.push(
        db.prepare(
          `UPDATE product_catalog_details
           SET name_en = ?, subcategory = ?, product_type = ?,
               type_fields_json = ?, search_sources_json = ?, thumbnail_url = ?,
               source_kind = 'verified_manual', source_reference = ?, updated_at = ?
           WHERE source_kind = 'user_sku_draft_import'
             AND product_id = (
             SELECT id FROM products
             WHERE lower(style_number) = lower(?) AND status != 'deleted'
             ORDER BY id DESC LIMIT 1
           )`,
        ).bind(
          item.nameEn,
          catalogSubcategory(item.subcategory),
          draftProductType(item),
          draftTypeFields(item),
          draftSources(item),
          item.imageUrl || "",
          item.sourceNote || "추가 페이지 다중 출처 검증 완료",
          now,
          item.sku,
        ),
      );
    }
    await db.batch(statements);
  }

  // 사용자가 지정한 1페이지 상품의 잘못된 영문명·영문 후기 문구만 바로잡는다.
  // 가격·재고·공개상태·사진 및 다른 관리자 수정값은 변경하지 않는다.
  const contentCorrection = PAGE_1_VERIFIED_DRAFTS.find((item) => item.sku === "DN1791-116");
  if (contentCorrection) {
    await db.prepare(
      `UPDATE products
       SET name = ?, description = ?, detail_content = ?
       WHERE lower(style_number) = lower(?) AND status != 'deleted'
         AND id IN (
           SELECT product_id FROM product_catalog_details
           WHERE source_kind IN ('user_sku_draft_import', 'verified_manual')
         )`,
    ).bind(
      contentCorrection.nameKo,
      draftDescription(contentCorrection),
      contentCorrection.detailContent || draftDescription(contentCorrection),
      contentCorrection.sku,
    ).run();
  }

  // 직전 검수본에 참고자료 사진이 섞였던 상품은 비공개 상태에서 사진만 회수하고 재검수 대기로 돌린다.
  // 관리자가 이미 상태를 바꿨거나 직접 관리하는 상품은 건드리지 않는다.
  for (const group of chunks([...PAGE_1_REVIEW_PENDING_SKUS, ...ALL_PAGES_REVIEW_PENDING_SKUS], CHUNK_SIZE)) {
    const placeholders = group.map(() => "?").join(",");
    await db.batch([
      db.prepare(
        `UPDATE products
         SET image_url = '', image_urls = '[]', media_json = '[]'
         WHERE lower(style_number) IN (${placeholders})
           AND status = 'draft'
           AND id IN (
             SELECT product_id FROM product_catalog_details
             WHERE source_kind = 'verified_manual'
               AND source_reference LIKE '%고화질 사진 사용%'
           )`,
      ).bind(...group.map((sku) => sku.toLowerCase())),
      db.prepare(
        `UPDATE product_catalog_details
         SET thumbnail_url = '', source_kind = 'user_sku_draft_import',
             source_reference = '외부 2개 이상 사진 출처 재검수 대기', updated_at = ?
         WHERE source_kind = 'verified_manual'
           AND source_reference LIKE '%고화질 사진 사용%'
           AND product_id IN (
             SELECT id FROM products
             WHERE lower(style_number) IN (${placeholders}) AND status = 'draft'
           )`,
      ).bind(now, ...group.map((sku) => sku.toLowerCase())),
    ]);
  }

  const brandRow = await db
    .prepare("SELECT value FROM settings WHERE key = 'product_brands'")
    .first<{ value: string }>();
  let savedBrands: string[] = [];
  try {
    const parsed = JSON.parse(brandRow?.value || "[]");
    if (Array.isArray(parsed)) savedBrands = parsed.map(String);
  } catch {
    savedBrands = [];
  }
  const importedBrands = IMPORTED_SKU_DRAFTS
    .map((item) => item.brand)
    .filter((brand) => brand !== "브랜드 확인 필요");
  const productBrands = Array.from(new Set([...savedBrands, ...importedBrands]));

  // 완료 버전을 기록하기 전에 관리 대상 상품의 사진 값이 실제 DB에 들어갔는지 확인한다.
  // 외부 공급처 주소만 저장되거나 갱신이 누락된 상태를 성공으로 기록하지 않는다.
  const photoDrafts = IMPORTED_SKU_DRAFTS.filter((item) =>
    item.mediaUrls?.some((url) => url.startsWith("/catalog/supplier/")),
  );
  for (const group of chunks(photoDrafts, CHUNK_SIZE)) {
    const placeholders = group.map(() => "?").join(",");
    const verification = await db.prepare(
      `SELECT COUNT(*) AS total,
              SUM(CASE
                WHEN image_url LIKE '/catalog/%' AND media_json != '[]' THEN 1
                ELSE 0
              END) AS with_photos
       FROM products
       WHERE lower(style_number) IN (${placeholders})
         AND status != 'deleted'
         AND id IN (
           SELECT product_id FROM product_catalog_details
           WHERE source_kind IN ('user_sku_draft_import', 'verified_manual')
         )`,
    ).bind(...group.map((item) => item.sku.toLowerCase())).first<{
      total: number;
      with_photos: number;
    }>();
    if (Number(verification?.with_photos || 0) !== Number(verification?.total || 0)) {
      throw new Error("supplier_product_photo_import_incomplete");
    }
  }

  await db.batch([
    db.prepare("UPDATE products SET badge = '' WHERE badge IN ('확인필요', '확인 필요')"),
    db.prepare(
      `INSERT INTO settings (key, value, updated_at)
       VALUES ('product_brands', ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    ).bind(JSON.stringify(productBrands), now),
    db.prepare(
      `INSERT INTO settings (key, value, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    ).bind(IMPORT_SETTING_KEY, IMPORT_VERSION, now),
  ]);
}
