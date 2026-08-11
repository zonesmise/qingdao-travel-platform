WITH RECURSIVE
  image_numbers(value) AS (VALUES (1) UNION ALL SELECT value + 1 FROM image_numbers WHERE value < 12),
  clothing(style_number, name, brand, subcategory, image_count) AS (
    VALUES
      ('A204', '아미 드 꾀흐 로고 후드 스웨트셔츠', '아미 (AMI Paris)', '상의', 12),
      ('A205', '아미 톤온톤 로고 후드 스웨트셔츠', '아미 (AMI Paris)', '상의', 12),
      ('A206', '아미 미니 하트 로고 후드 스웨트셔츠', '아미 (AMI Paris)', '상의', 12),
      ('B101', '아미 빅 하트 로고 맨투맨', '아미 (AMI Paris)', '상의', 12),
      ('B102', '아미 미니 하트 로고 맨투맨', '아미 (AMI Paris)', '상의', 12),
      ('B103', '아미 드 꾀흐 로고 맨투맨', '아미 (AMI Paris)', '상의', 12),
      ('B104', '아미 미니 하트 로고 스웨트셔츠', '아미 (AMI Paris)', '상의', 12),
      ('B105', '아미 톤온톤 로고 스웨트셔츠', '아미 (AMI Paris)', '상의', 12),
      ('B106', '아미 빅 하트 로고 스웨트셔츠', '아미 (AMI Paris)', '상의', 12),
      ('2106-3B', '발렌시아가 로고 긴팔 폴로 셔츠', '발렌시아가 (BALENCIAGA)', '상의', 12),
      ('26305-3B', '버버리 로고 트랙 재킷', '버버리 (Burberry)', '아우터', 12),
      ('86202', '셀린느 트리옹프 로고 후드 스웨트셔츠', '셀린느 (CELINE)', '상의', 9),
      ('K781', '크롬하츠 로고 긴팔 셔츠', '크롬하츠 (CHROME HEARTS)', '상의', 12),
      ('D34', '크롬하츠 서클 로고 긴팔 티셔츠', '크롬하츠 (CHROME HEARTS)', '상의', 12),
      ('D01', '메종 마르지엘라 로고 긴팔 티셔츠', '메종 마르지엘라 (Maison Margiela)', '상의', 12),
      ('D75', '크롬하츠 멀티 크로스 긴팔 티셔츠', '크롬하츠 (CHROME HEARTS)', '상의', 12),
      ('D51', '크롬하츠 스타 로고 긴팔 티셔츠', '크롬하츠 (CHROME HEARTS)', '상의', 12),
      ('2256W', '캐나다구스 여성 후드 패딩 재킷', '캐나다구스 (Canada Goose)', '아우터', 12),
      ('2252M', '캐나다구스 남성 후드 패딩 재킷', '캐나다구스 (Canada Goose)', '아우터', 12),
      ('2051', '캐나다구스 후드 패딩 재킷', '캐나다구스 (Canada Goose)', '아우터', 12)
  )
INSERT INTO products
  (name, category, brand, product_code, style_number, description, image_url,
   image_urls, media_json, options_json, variants_json, detail_content, shipping_info,
   point_price, point_usage_mode, point_max_percent, cash_payment_enabled,
   reward_on_cash_only, stock, status, badge, sales_count, created_at)
SELECT
  clothing.name, '의류', clothing.brand, 'CLOTHING-' || clothing.style_number,
  clothing.style_number, clothing.name || ' 상품입니다.',
  '/catalog/clothing/' || clothing.style_number || '/01.webp',
  (SELECT json_group_array('/catalog/clothing/' || clothing.style_number || '/' || printf('%02d', image_numbers.value) || '.webp')
     FROM image_numbers WHERE image_numbers.value <= clothing.image_count),
  '[]', '[]', '[]', clothing.name || ' 상품의 상세 이미지와 정보를 확인해 주세요.',
  '중국 판매자가 발송하며 플랫폼이 결제와 배송을 관리하는 해외직구 상품입니다.',
  999, 'full', 100, 1, 1, 999, 'active', '', 0, datetime('now')
FROM clothing
WHERE NOT EXISTS (
  SELECT 1 FROM products
  WHERE lower(products.style_number) = lower(clothing.style_number)
    AND products.status != 'deleted'
);
--> statement-breakpoint
WITH clothing(style_number, subcategory) AS (
  VALUES
    ('A204', '상의'), ('A205', '상의'), ('A206', '상의'), ('B101', '상의'), ('B102', '상의'),
    ('B103', '상의'), ('B104', '상의'), ('B105', '상의'), ('B106', '상의'), ('2106-3B', '상의'),
    ('26305-3B', '아우터'), ('86202', '상의'), ('K781', '상의'), ('D34', '상의'), ('D01', '상의'),
    ('D75', '상의'), ('D51', '상의'), ('2256W', '아우터'), ('2252M', '아우터'), ('2051', '아우터')
)
INSERT INTO product_catalog_details
  (product_id, name_en, subcategory, product_type, sale_price, points_price,
   featured, type_fields_json, search_sources_json, thumbnail_url,
   source_kind, source_reference, created_at, updated_at)
SELECT
  products.id, '', clothing.subcategory, 'clothing', 999, 999, 0,
  '{"gender":"공용"}', '[]', products.image_url,
  'supplier', 'sky678', datetime('now'), datetime('now')
FROM clothing
JOIN products ON lower(products.style_number) = lower(clothing.style_number)
WHERE products.status != 'deleted'
ON CONFLICT(product_id) DO UPDATE SET
  subcategory = excluded.subcategory,
  product_type = excluded.product_type,
  sale_price = excluded.sale_price,
  points_price = excluded.points_price,
  thumbnail_url = excluded.thumbnail_url,
  updated_at = excluded.updated_at;
