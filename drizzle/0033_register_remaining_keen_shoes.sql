WITH RECURSIVE
  image_numbers(value) AS (VALUES (1) UNION ALL SELECT value + 1 FROM image_numbers WHERE value < 12),
  keen_shoes(style_number, name, name_en, source_url, image_count, color, material, country) AS (
    VALUES
      ('1004337', '킨 재스퍼 캐세이 스파이스/오리온 블루 여성용', 'KEEN Jasper Cathay Spice/Orion Blue Women', 'https://www.keenfootwear.it/products/jasper-scarpe-donna-cathay-spice-orion-blue-1004337', 3, '캐세이 스파이스/오리온 블루', '스웨이드·메쉬·고무', ''),
      ('1004347', '킨 재스퍼 실버 밍크 여성용', 'KEEN Jasper Silver Mink Women', 'https://m.keenfootwear.kr/goods/goods_view.php?goodsNo=1000000448', 5, '실버 밍크', '스웨이드·메쉬·고무', '태국')
  )
INSERT INTO products
  (name, category, brand, product_code, style_number, description, image_url,
   image_urls, media_json, options_json, variants_json, detail_content, shipping_info,
   point_price, point_usage_mode, point_max_percent, cash_payment_enabled,
   reward_on_cash_only, stock, status, badge, sales_count, created_at)
SELECT
  keen_shoes.name, '신발', '킨 (KEEN)', 'SHOES-' || keen_shoes.style_number,
  keen_shoes.style_number,
  '클라이밍화에서 영감을 받은 KEEN 재스퍼 여성용 스니커즈입니다.',
  '/catalog/shoes/' || keen_shoes.style_number || '/01.webp',
  (SELECT json_group_array('/catalog/shoes/' || keen_shoes.style_number || '/' || printf('%02d', image_numbers.value) || '.webp')
     FROM image_numbers WHERE image_numbers.value <= keen_shoes.image_count),
  '[]', '[]', '[]',
  keen_shoes.name || ' 상품입니다. 스웨이드 어퍼와 통기성 좋은 메쉬 안감, 논마킹 고무 아웃솔을 사용했습니다.',
  '중국 판매자가 발송하며 플랫폼이 결제와 배송을 관리하는 해외직구 상품입니다.',
  999, 'full', 100, 1, 1, 999, 'active', '', 0, datetime('now')
FROM keen_shoes
WHERE NOT EXISTS (
  SELECT 1 FROM products
  WHERE lower(products.style_number) = lower(keen_shoes.style_number)
    AND products.status != 'deleted'
);
--> statement-breakpoint
WITH keen_shoes(style_number, name_en, source_url, color, material, country) AS (
  VALUES
    ('1004337', 'KEEN Jasper Cathay Spice/Orion Blue Women', 'https://www.keenfootwear.it/products/jasper-scarpe-donna-cathay-spice-orion-blue-1004337', '캐세이 스파이스/오리온 블루', '스웨이드·메쉬·고무', ''),
    ('1004347', 'KEEN Jasper Silver Mink Women', 'https://m.keenfootwear.kr/goods/goods_view.php?goodsNo=1000000448', '실버 밍크', '스웨이드·메쉬·고무', '태국')
)
INSERT INTO product_catalog_details
  (product_id, name_en, subcategory, product_type, sale_price, points_price,
   featured, type_fields_json, search_sources_json, thumbnail_url,
   source_kind, source_reference, created_at, updated_at)
SELECT
  products.id, keen_shoes.name_en, '스니커즈', 'shoes', 999, 999, 0,
  json_object('gender', '여성용', 'color', keen_shoes.color, 'material', keen_shoes.material, 'country', keen_shoes.country),
  json_array(keen_shoes.source_url), products.image_url,
  'web-verified', keen_shoes.source_url, datetime('now'), datetime('now')
FROM keen_shoes
JOIN products ON lower(products.style_number) = lower(keen_shoes.style_number)
WHERE products.status != 'deleted'
ON CONFLICT(product_id) DO UPDATE SET
  name_en = excluded.name_en,
  subcategory = excluded.subcategory,
  product_type = excluded.product_type,
  sale_price = excluded.sale_price,
  points_price = excluded.points_price,
  type_fields_json = excluded.type_fields_json,
  search_sources_json = excluded.search_sources_json,
  thumbnail_url = excluded.thumbnail_url,
  source_kind = excluded.source_kind,
  source_reference = excluded.source_reference,
  updated_at = excluded.updated_at;
