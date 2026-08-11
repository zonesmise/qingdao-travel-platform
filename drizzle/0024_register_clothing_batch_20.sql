WITH RECURSIVE
  image_numbers(value) AS (VALUES (1) UNION ALL SELECT value + 1 FROM image_numbers WHERE value < 12),
  clothing(style_number, name, brand, image_count) AS (
    VALUES
      ('142439', '오프화이트 애로우 로고 반팔 티셔츠', '오프화이트 (Off-White)', 9),
      ('154947', '프라다 로고 반팔 폴로 셔츠', '프라다 (Prada)', 7),
      ('D349-A60', '프라다 로고 반팔 폴로 셔츠', '프라다 (Prada)', 12),
      ('hqcp001', '구찌 더블 G 로고 반팔 티셔츠', '구찌 (GUCCI)', 8),
      ('gucci002', '구찌 GG 패턴 반팔 폴로 셔츠', '구찌 (GUCCI)', 8),
      ('MYZ9887', '구찌 웹 스트라이프 반팔 티셔츠', '구찌 (GUCCI)', 12),
      ('K302', '발렌시아가 로고 반팔 티셔츠', '발렌시아가 (BALENCIAGA)', 12),
      ('K181', '디올 47 로고 반팔 티셔츠', '디올 (DIOR)', 10),
      ('687457', '루이비통 포켓 반팔 티셔츠', '루이비통 (Louis Vuitton)', 6),
      ('171657', '라코스테 크로코다일 반팔 폴로 셔츠', '라코스테 (Lacoste)', 12),
      ('0625N', '디올 로고 반팔 티셔츠', '디올 (DIOR)', 11),
      ('06DY-D', '디올 레터링 반팔 티셔츠', '디올 (DIOR)', 12),
      ('06TT-D', '아크네 스튜디오 로고 반팔 티셔츠', '아크네 스튜디오 (Acne Studios)', 12),
      ('175616', '구찌 인터로킹 G 반팔 티셔츠', '구찌 (GUCCI)', 10),
      ('175610', '디올 로고 반팔 폴로 셔츠', '디올 (DIOR)', 7),
      ('113189', '메종 마르지엘라 넘버 로고 반팔 티셔츠', '메종 마르지엘라 (Maison Margiela)', 9),
      ('DD151', '톰 브라운 스트라이프 반팔 폴로 셔츠', '톰 브라운 (Thom Browne)', 5),
      ('113144', '셀린느 로고 반팔 티셔츠', '셀린느 (CELINE)', 12),
      ('K297', '발렌시아가 로고 반팔 티셔츠', '발렌시아가 (BALENCIAGA)', 12),
      ('316', '메종 마르지엘라 넘버 로고 반팔 티셔츠', '메종 마르지엘라 (Maison Margiela)', 9)
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
WITH clothing(style_number) AS (
  VALUES
    ('142439'), ('154947'), ('D349-A60'), ('hqcp001'), ('gucci002'),
    ('MYZ9887'), ('K302'), ('K181'), ('687457'), ('171657'),
    ('0625N'), ('06DY-D'), ('06TT-D'), ('175616'), ('175610'),
    ('113189'), ('DD151'), ('113144'), ('K297'), ('316')
)
INSERT INTO product_catalog_details
  (product_id, name_en, subcategory, product_type, sale_price, points_price,
   featured, type_fields_json, search_sources_json, thumbnail_url,
   source_kind, source_reference, created_at, updated_at)
SELECT
  products.id, '', '상의', 'clothing', 999, 999, 0,
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
