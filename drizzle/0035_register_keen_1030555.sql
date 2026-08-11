WITH RECURSIVE
  image_numbers(value) AS (VALUES (1) UNION ALL SELECT value + 1 FROM image_numbers WHERE value < 6),
  keen_shoes(style_number, name, name_en, source_url, color, material, country) AS (
    VALUES
      ('1030555', '킨 재스퍼 카라멜 여성용', 'KEEN Jasper Caramel Women', 'https://m.keenfootwear.kr/goods/goods_view.php?goodsNo=1000000239', 'Chipmunk/Birch', '스웨이드·메쉬·고무', '캄보디아')
  )
INSERT INTO products
  (name, category, brand, product_code, style_number, description, image_url,
   image_urls, media_json, options_json, variants_json, detail_content, shipping_info,
   point_price, point_usage_mode, point_max_percent, cash_payment_enabled,
   reward_on_cash_only, stock, status, badge, sales_count, created_at)
SELECT
  keen_shoes.name, '신발', '킨 (KEEN)', 'SHOES-' || keen_shoes.style_number, keen_shoes.style_number,
  '카라멜 색상의 여성용 KEEN 재스퍼 스니커즈입니다.',
  '/catalog/shoes/1030555/01.webp',
  (SELECT json_group_array('/catalog/shoes/1030555/' || printf('%02d', image_numbers.value) || '.webp') FROM image_numbers),
  '[]', '[]', '[]',
  '클라이밍화에서 영감을 받은 여성용 스니커즈입니다. 스웨이드 어퍼, 통기성 좋은 메쉬 안감, 논마킹 고무 아웃솔과 탈착 가능한 폼 인솔을 사용했습니다.',
  '중국 판매자가 배송하며 플랫폼이 결제와 배송을 관리하는 해외직구 상품입니다.',
  999, 'full', 100, 1, 1, 999, 'active', '', 0, datetime('now')
FROM keen_shoes
WHERE NOT EXISTS (
  SELECT 1 FROM products WHERE lower(style_number) = lower(keen_shoes.style_number) AND status != 'deleted'
);
--> statement-breakpoint
INSERT INTO product_catalog_details
  (product_id, name_en, subcategory, product_type, sale_price, points_price,
   featured, type_fields_json, search_sources_json, thumbnail_url,
   source_kind, source_reference, created_at, updated_at)
SELECT
  products.id, 'KEEN Jasper Caramel Women', '스니커즈', 'shoes', 999, 999, 0,
  json_object(
    'gender', '여성용',
    'color', 'Chipmunk/Birch',
    'material', '스웨이드·메쉬·고무',
    'country', '캄보디아',
    'heelHeight', '27mm',
    'weight', '350g'
  ),
  json_array('https://m.keenfootwear.kr/goods/goods_view.php?goodsNo=1000000239'),
  products.image_url, 'web-verified',
  'https://m.keenfootwear.kr/goods/goods_view.php?goodsNo=1000000239',
  datetime('now'), datetime('now')
FROM products
WHERE lower(products.style_number) = '1030555' AND products.status != 'deleted'
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
