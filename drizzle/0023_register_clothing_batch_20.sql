WITH RECURSIVE
  image_numbers(value) AS (VALUES (1) UNION ALL SELECT value + 1 FROM image_numbers WHERE value < 12),
  clothing(style_number, name, brand, image_count) AS (
    VALUES
      ('58175D', '몽클레르 로고 반팔 티셔츠', '몽클레르 (Moncler)', 4),
      ('127679', '몽클레르 스크립트 로고 반팔 티셔츠', '몽클레르 (Moncler)', 12),
      ('144967', '로로피아나 로고 반팔 티셔츠', '로로피아나 (Loro Piana)', 12),
      ('134739', '버버리 체크 칼라 반팔 폴로 셔츠', '버버리 (Burberry)', 11),
      ('134733', '버버리 스트라이프 반팔 폴로 셔츠', '버버리 (Burberry)', 9),
      ('134708', '루이비통 스트라이프 반팔 폴로 셔츠', '루이비통 (Louis Vuitton)', 9),
      ('113109', '발렌시아가 로고 오버핏 반팔 티셔츠', '발렌시아가 (BALENCIAGA)', 11),
      ('134952', '샤넬 스트라이프 반팔 니트 폴로 셔츠', '샤넬 (CHANEL)', 11),
      ('146744', '에르메스 레터링 반팔 티셔츠', '에르메스 (Hermès)', 6),
      ('127014', '에르메스 로고 반팔 티셔츠', '에르메스 (Hermès)', 6),
      ('125245', '버버리 체크 칼라 반팔 폴로 셔츠', '버버리 (Burberry)', 10),
      ('134744', '버버리 스트라이프 반팔 폴로 셔츠', '버버리 (Burberry)', 12),
      ('140085', '프라다 로고 반팔 티셔츠', '프라다 (Prada)', 12),
      ('126494', '로로피아나 반팔 폴로 셔츠', '로로피아나 (Loro Piana)', 12),
      ('112362', '씨피 컴퍼니 로고 반팔 티셔츠', '씨피 컴퍼니 (C.P. COMPANY)', 12),
      ('112351', '씨피 컴퍼니 로고 반팔 티셔츠', '씨피 컴퍼니 (C.P. COMPANY)', 12),
      ('782865', '씨피 컴퍼니 렌즈 로고 반팔 티셔츠', '씨피 컴퍼니 (C.P. COMPANY)', 7),
      ('7060', '씨피 컴퍼니 그래픽 반팔 티셔츠', '씨피 컴퍼니 (C.P. COMPANY)', 12),
      ('117885', '씨피 컴퍼니 그래픽 반팔 티셔츠', '씨피 컴퍼니 (C.P. COMPANY)', 6),
      ('MJN535', '미우미우 로고 반팔 폴로 셔츠', '미우미우 (Miu Miu)', 10)
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
    ('58175D'), ('127679'), ('144967'), ('134739'), ('134733'),
    ('134708'), ('113109'), ('134952'), ('146744'), ('127014'),
    ('125245'), ('134744'), ('140085'), ('126494'), ('112362'),
    ('112351'), ('782865'), ('7060'), ('117885'), ('MJN535')
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
