WITH RECURSIVE
  image_numbers(value) AS (VALUES (1) UNION ALL SELECT value + 1 FROM image_numbers WHERE value < 12),
  clothing(style_number, name, brand, subcategory, image_count) AS (
    VALUES
      ('K604', '발렌시아가 로고 반팔 티셔츠', '발렌시아가 (BALENCIAGA)', '상의', 8),
      ('K207', '크롬하츠 크리스털 로고 반팔 티셔츠', '크롬하츠 (CHROME HEARTS)', '상의', 8),
      ('K315', '메종 마르지엘라 로고 반팔 티셔츠', '메종 마르지엘라 (Maison Margiela)', '상의', 10),
      ('191010', '스투시 와플 반팔 티셔츠', '스투시 (Stüssy)', '상의', 9),
      ('193286', '크롬하츠 로고 긴팔 티셔츠', '크롬하츠 (CHROME HEARTS)', '상의', 12),
      ('2116-4B', '몽클레르 후드 재킷', '몽클레르 (Moncler)', '아우터', 9),
      ('D370-C30', '몽클레르 로고 패딩 베스트', '몽클레르 (Moncler)', '아우터', 12),
      ('D338-C70', '버버리 체크 후드 재킷', '버버리 (Burberry)', '아우터', 12),
      ('86513-818', '루이비통 로고 니트 재킷', '루이비통 (Louis Vuitton)', '아우터', 12),
      ('208347', '루이비통 후드 재킷', '루이비통 (Louis Vuitton)', '아우터', 12),
      ('25339-5B', '미우미우 로고 하프집업 니트', '미우미우 (Miu Miu)', '상의', 9),
      ('205004', '미우미우 스트라이프 긴팔 티셔츠', '미우미우 (Miu Miu)', '상의', 9),
      ('1685121-B45', '발렌시아가 집업 재킷', '발렌시아가 (BALENCIAGA)', '아우터', 12),
      ('214592', '디올 스트라이프 긴팔 니트', '디올 (DIOR)', '상의', 12),
      ('214735', '미우미우 스트라이프 긴팔 티셔츠', '미우미우 (Miu Miu)', '상의', 12),
      ('FF762', '아크네 스튜디오 체크 재킷', '아크네 스튜디오 (Acne Studios)', '아우터', 12),
      ('206169', '아크네 스튜디오 로고 긴팔 티셔츠', '아크네 스튜디오 (Acne Studios)', '상의', 12),
      ('K131', '프라다 밀라노 로고 반팔 티셔츠', '프라다 (Prada)', '상의', 8),
      ('K180', '프라다 로고 반팔 티셔츠', '프라다 (Prada)', '상의', 10),
      ('K169', '루이비통 그래픽 반팔 티셔츠', '루이비통 (Louis Vuitton)', '상의', 10)
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
    ('K604', '상의'), ('K207', '상의'), ('K315', '상의'), ('191010', '상의'), ('193286', '상의'),
    ('2116-4B', '아우터'), ('D370-C30', '아우터'), ('D338-C70', '아우터'), ('86513-818', '아우터'), ('208347', '아우터'),
    ('25339-5B', '상의'), ('205004', '상의'), ('1685121-B45', '아우터'), ('214592', '상의'), ('214735', '상의'),
    ('FF762', '아우터'), ('206169', '상의'), ('K131', '상의'), ('K180', '상의'), ('K169', '상의')
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
