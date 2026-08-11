WITH RECURSIVE
  image_numbers(value) AS (VALUES (1) UNION ALL SELECT value + 1 FROM image_numbers WHERE value < 12),
  clothing(style_number, name, brand, subcategory, image_count) AS (
    VALUES
      ('2058', '캐나다구스 후드 패딩 재킷', '캐나다구스 (Canada Goose)', '아우터', 12),
      ('2227', '캐나다구스 경량 후드 패딩 재킷', '캐나다구스 (Canada Goose)', '아우터', 12),
      ('13', '캐나다구스 퍼 후드 파카', '캐나다구스 (Canada Goose)', '아우터', 12),
      ('5078', '캐나다구스 후드 다운 재킷', '캐나다구스 (Canada Goose)', '아우터', 12),
      ('22', '캐나다구스 퍼 후드 롱 파카', '캐나다구스 (Canada Goose)', '아우터', 12),
      ('2282', '캐나다구스 후드 패딩 베스트', '캐나다구스 (Canada Goose)', '아우터', 12),
      ('2802M', '캐나다구스 남성 후드 패딩 재킷', '캐나다구스 (Canada Goose)', '아우터', 12),
      ('2057MW', '캐나다구스 패딩 베스트', '캐나다구스 (Canada Goose)', '아우터', 9),
      ('2801', '캐나다구스 후드 패딩 재킷', '캐나다구스 (Canada Goose)', '아우터', 11),
      ('2229', '캐나다구스 여성 경량 패딩 베스트', '캐나다구스 (Canada Goose)', '아우터', 9),
      ('2800', '캐나다구스 블랙 라벨 패딩 재킷', '캐나다구스 (Canada Goose)', '아우터', 11),
      ('2048', '캐나다구스 퍼 후드 패딩 재킷', '캐나다구스 (Canada Goose)', '아우터', 12),
      ('2227MB', '캐나다구스 블랙 라벨 경량 패딩 재킷', '캐나다구스 (Canada Goose)', '아우터', 12),
      ('2239L', '캐나다구스 여성 경량 패딩 재킷', '캐나다구스 (Canada Goose)', '아우터', 12),
      ('5079', '캐나다구스 후드 패딩 재킷', '캐나다구스 (Canada Goose)', '아우터', 12),
      ('2228', '캐나다구스 여성 경량 패딩 재킷', '캐나다구스 (Canada Goose)', '아우터', 12),
      ('2080M', '캐나다구스 남성 후드 패딩 재킷', '캐나다구스 (Canada Goose)', '아우터', 12),
      ('2804M', '캐나다구스 남성 패딩 베스트', '캐나다구스 (Canada Goose)', '아우터', 12),
      ('BB877-B70', '아미 드 꾀흐 로고 데님 집업 재킷', '아미 (AMI Paris)', '아우터', 12),
      ('AA503', '브루넬로 쿠치넬리 체크 안감 집업 재킷', '브루넬로 쿠치넬리 (Brunello Cucinelli)', '아우터', 12)
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
    ('2058', '아우터'), ('2227', '아우터'), ('13', '아우터'), ('5078', '아우터'), ('22', '아우터'),
    ('2282', '아우터'), ('2802M', '아우터'), ('2057MW', '아우터'), ('2801', '아우터'), ('2229', '아우터'),
    ('2800', '아우터'), ('2048', '아우터'), ('2227MB', '아우터'), ('2239L', '아우터'), ('5079', '아우터'),
    ('2228', '아우터'), ('2080M', '아우터'), ('2804M', '아우터'), ('BB877-B70', '아우터'), ('AA503', '아우터')
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
