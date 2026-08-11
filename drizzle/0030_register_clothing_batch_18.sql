WITH RECURSIVE
  image_numbers(value) AS (VALUES (1) UNION ALL SELECT value + 1 FROM image_numbers WHERE value < 12),
  clothing(style_number, name, brand, subcategory, image_count) AS (
    VALUES
      ('2009', '몽클레르 롱 다운 패딩 코트', '몽클레르 (Moncler)', '아우터', 8),
      ('137871', '몽클레르 퀼팅 다운 패딩 조끼', '몽클레르 (Moncler)', '아우터', 10),
      ('137872', '몽클레르 후드 다운 패딩 조끼', '몽클레르 (Moncler)', '아우터', 8),
      ('FFF7', '몽클레르 후드 다운 패딩 재킷', '몽클레르 (Moncler)', '아우터', 10),
      ('M-ESCAUT', '몽클레르 에스코트 후드 다운 재킷', '몽클레르 (Moncler)', '아우터', 5),
      ('M-HUPPE', '몽클레르 후페 후드 다운 패딩 조끼', '몽클레르 (Moncler)', '아우터', 12),
      ('M-A', '몽클레르 A라인 후드 다운 재킷', '몽클레르 (Moncler)', '아우터', 8),
      ('M-1616', '몽클레르 퀼팅 다운 패딩 조끼', '몽클레르 (Moncler)', '아우터', 8),
      ('137805', '몽클레르 후드 다운 패딩 재킷', '몽클레르 (Moncler)', '아우터', 9),
      ('106943', '몽클레르 경량 다운 패딩 재킷', '몽클레르 (Moncler)', '아우터', 12),
      ('LJ-106935', '몽클레르 퍼 후드 롱 다운 코트', '몽클레르 (Moncler)', '아우터', 11),
      ('LJ-106798', '몽클레르 경량 퀼팅 다운 재킷', '몽클레르 (Moncler)', '아우터', 12),
      ('LJ-106947', '몽클레르 퍼 후드 다운 패딩 재킷', '몽클레르 (Moncler)', '아우터', 10),
      ('339061', '구찌 웹 스트라이프 컬러블록 후드 재킷', '구찌 (GUCCI)', '아우터', 9),
      ('B04', 'MM6 메종 마르지엘라 로고 긴팔 티셔츠', '메종 마르지엘라 (Maison Margiela)', '상의', 12),
      ('AA676', '크롬하츠 세메터리 크로스 후드 티셔츠', '크롬하츠 (CHROME HEARTS)', '상의', 12),
      ('26291', '아미 드 꾀흐 로고 니트 폴로 셔츠', '아미 (AMI Paris)', '상의', 12),
      ('113398', '셀린느 트리옹프 로고 긴팔 티셔츠', '셀린느 (CELINE)', '상의', 12)
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
    ('2009', '아우터'), ('137871', '아우터'), ('137872', '아우터'), ('FFF7', '아우터'),
    ('M-ESCAUT', '아우터'), ('M-HUPPE', '아우터'), ('M-A', '아우터'), ('M-1616', '아우터'),
    ('137805', '아우터'), ('106943', '아우터'), ('LJ-106935', '아우터'), ('LJ-106798', '아우터'),
    ('LJ-106947', '아우터'), ('339061', '아우터'), ('B04', '상의'), ('AA676', '상의'),
    ('26291', '상의'), ('113398', '상의')
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
