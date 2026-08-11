WITH RECURSIVE
  image_numbers(value) AS (VALUES (1) UNION ALL SELECT value + 1 FROM image_numbers WHERE value < 12),
  clothing(style_number, name, brand, subcategory, image_count) AS (
    VALUES
      ('55036', '로에베 아나그램 데님 재킷', '로에베 (LOEWE)', '아우터', 12),
      ('801034', '지방시 로고 후드 집업 재킷', '지방시 (Givenchy)', '아우터', 10),
      ('24066-A70', '프라다 트라이앵글 로고 집업 니트 재킷', '프라다 (Prada)', '아우터', 9),
      ('25196-B10', '로에베 아나그램 후드 티셔츠', '로에베 (LOEWE)', '상의', 12),
      ('D406-B30', '펜디 FF 모노그램 니트 스웨터', '펜디 (FENDI)', '상의', 11),
      ('86545-818', '로로피아나 하이넥 캐시미어 니트', '로로피아나 (Loro Piana)', '상의', 12),
      ('86580-818', '로로피아나 크루넥 캐시미어 니트', '로로피아나 (Loro Piana)', '상의', 12),
      ('BB864-B70', '아미 드 꾀흐 로고 데님 셔츠', '아미 (AMI Paris)', '상의', 12),
      ('K78', '발렌시아가 로고 오버사이즈 셔츠', '발렌시아가 (BALENCIAGA)', '상의', 12),
      ('2516', '몽클레르 퀼팅 다운 패딩 재킷', '몽클레르 (Moncler)', '아우터', 9),
      ('C36', '크롬하츠 크로스 패턴 다운 재킷', '크롬하츠 (CHROME HEARTS)', '아우터', 6),
      ('137788', '무스너클 롱 다운 패딩 코트', '무스너클 (Moose Knuckles)', '아우터', 5),
      ('137766', '몽클레르 경량 다운 재킷 베이지', '몽클레르 (Moncler)', '아우터', 9),
      ('137765', '몽클레르 경량 다운 재킷 블랙', '몽클레르 (Moncler)', '아우터', 8),
      ('137761', '몽클레르 퀼팅 경량 다운 재킷', '몽클레르 (Moncler)', '아우터', 9),
      ('137633', '몽클레르 퍼 후드 다운 패딩 재킷', '몽클레르 (Moncler)', '아우터', 4),
      ('137855', '몽클레르 스트라이프 퀼팅 다운 코트', '몽클레르 (Moncler)', '아우터', 12),
      ('C86', '몽클레르 벨티드 후드 다운 재킷', '몽클레르 (Moncler)', '아우터', 8),
      ('137786', '몽클레르 롱 다운 패딩 코트', '몽클레르 (Moncler)', '아우터', 10),
      ('137780', '캐나다구스 블랙 라벨 다운 패딩 재킷', '캐나다구스 (Canada Goose)', '아우터', 8)
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
    ('55036', '아우터'), ('801034', '아우터'), ('24066-A70', '아우터'), ('25196-B10', '상의'),
    ('D406-B30', '상의'), ('86545-818', '상의'), ('86580-818', '상의'), ('BB864-B70', '상의'),
    ('K78', '상의'), ('2516', '아우터'), ('C36', '아우터'), ('137788', '아우터'),
    ('137766', '아우터'), ('137765', '아우터'), ('137761', '아우터'), ('137633', '아우터'),
    ('137855', '아우터'), ('C86', '아우터'), ('137786', '아우터'), ('137780', '아우터')
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
