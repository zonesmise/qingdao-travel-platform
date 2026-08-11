WITH RECURSIVE
  image_numbers(value) AS (VALUES (1) UNION ALL SELECT value + 1 FROM image_numbers WHERE value < 12),
  clothing(style_number, name, brand, subcategory, image_count) AS (
    VALUES
      ('2010-3B', '발렌시아가 로고 후드 셋업', '발렌시아가 (BALENCIAGA)', '셋업', 12),
      ('25343-3B', '발렌시아가 로고 후드 티셔츠', '발렌시아가 (BALENCIAGA)', '상의', 12),
      ('219694', '루이비통 로고 긴팔 폴로 셔츠', '루이비통 (Louis Vuitton)', '상의', 10),
      ('26230', '디올 컬러 블록 맨투맨', '디올 (DIOR)', '상의', 11),
      ('192062', '몽클레르 스트라이프 재킷 셋업', '몽클레르 (Moncler)', '셋업', 12),
      ('86530', '디올 스트라이프 반팔 폴로 셔츠', '디올 (DIOR)', '상의', 6),
      ('238421', '구찌 로고 반팔 티셔츠', '구찌 (GUCCI)', '상의', 10),
      ('234442', '몽클레르 배색 반팔 폴로 셔츠', '몽클레르 (Moncler)', '상의', 8),
      ('191800', '아크네 스튜디오 로고 집업 재킷', '아크네 스튜디오 (Acne Studios)', '아우터', 12),
      ('235810', '아크네 스튜디오 집업 재킷', '아크네 스튜디오 (Acne Studios)', '아우터', 12),
      ('451468', '몽클레르 로고 후드 티셔츠', '몽클레르 (Moncler)', '상의', 7),
      ('25307', '몽클레르 로고 니트 스웨터', '몽클레르 (Moncler)', '상의', 12),
      ('25253', '루이비통 로고 집업 재킷', '루이비통 (Louis Vuitton)', '아우터', 11),
      ('192518', '프라다 배색 후드 재킷', '프라다 (Prada)', '아우터', 10),
      ('26045', '디올 체크 셔츠 재킷', '디올 (DIOR)', '아우터', 12),
      ('2013-4B', '크롬하츠 로고 집업 재킷', '크롬하츠 (CHROME HEARTS)', '아우터', 9),
      ('26221', '디올 로고 니트 스웨터', '디올 (DIOR)', '상의', 12),
      ('A201', '아미 드 꾀흐 로고 후드 티셔츠', '아미 (AMI Paris)', '상의', 12),
      ('A202', '아미 톤온톤 로고 후드 티셔츠', '아미 (AMI Paris)', '상의', 12),
      ('A203', '아미 미니 하트 로고 후드 티셔츠', '아미 (AMI Paris)', '상의', 12)
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
    ('2010-3B', '셋업'), ('25343-3B', '상의'), ('219694', '상의'), ('26230', '상의'), ('192062', '셋업'),
    ('86530', '상의'), ('238421', '상의'), ('234442', '상의'), ('191800', '아우터'), ('235810', '아우터'),
    ('451468', '상의'), ('25307', '상의'), ('25253', '아우터'), ('192518', '아우터'), ('26045', '아우터'),
    ('2013-4B', '아우터'), ('26221', '상의'), ('A201', '상의'), ('A202', '상의'), ('A203', '상의')
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
