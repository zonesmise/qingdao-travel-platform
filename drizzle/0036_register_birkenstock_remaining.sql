WITH RECURSIVE
  image_numbers(value) AS (VALUES (1) UNION ALL SELECT value + 1 FROM image_numbers WHERE value < 8),
  shoes(style_number, name, name_en, source_url, color, gender) AS (
    VALUES
      ('1027382', '버켄스탁 보스턴 EVA 에그쉘', 'Birkenstock Boston EVA Eggshell', 'https://www.birkenstock.com/jp/boston-eva/boston-eva-eva-0-eva-u_1631.html', 'Eggshell', '공용'),
      ('1027386', '버켄스탁 보스턴 EVA 로스트 남성용', 'Birkenstock Boston EVA Roast Men', 'https://www.birkenstock.com.tr/erkek-kahverengi-kapali-terlik-plaj-grubu-1027386/', 'Roast', '남성용')
  )
INSERT INTO products
  (name, category, brand, product_code, style_number, description, image_url,
   image_urls, media_json, options_json, variants_json, detail_content, shipping_info,
   point_price, point_usage_mode, point_max_percent, cash_payment_enabled,
   reward_on_cash_only, stock, status, badge, sales_count, created_at)
SELECT
  shoes.name, '신발', '버켄스탁 (BIRKENSTOCK)', 'SHOES-' || shoes.style_number, shoes.style_number,
  shoes.color || ' 색상의 가볍고 물에 강한 버켄스탁 보스턴 EVA 클로그입니다.',
  '/catalog/shoes/' || shoes.style_number || '/01.webp',
  (SELECT json_group_array('/catalog/shoes/' || shoes.style_number || '/' || printf('%02d', image_numbers.value) || '.webp') FROM image_numbers),
  '[]', '[]', '[]',
  '보스턴의 클래식한 형태를 한 조각 EVA 소재로 완성했습니다. 갑피·안창·밑창에 EVA를 사용하여 가볍고 물세척이 가능하며, 독일에서 제조된 상품입니다.',
  '중국 판매자가 발송하고 플랫폼이 결제와 배송을 관리하는 해외직구 상품입니다. 통관과 현지 배송 상황에 따라 배송 기간이 달라질 수 있습니다.',
  999, 'full', 100, 1, 1, 999, 'active', '', 0, datetime('now')
FROM shoes
WHERE NOT EXISTS (
  SELECT 1 FROM products WHERE lower(style_number) = lower(shoes.style_number) AND status != 'deleted'
);
--> statement-breakpoint
INSERT INTO product_catalog_details
  (product_id, name_en, subcategory, product_type, sale_price, points_price,
   featured, type_fields_json, search_sources_json, thumbnail_url,
   source_kind, source_reference, created_at, updated_at)
SELECT
  products.id, shoes.name_en, '샌들·슬리퍼', 'shoes', 999, 999, 0,
  json_object(
    'gender', shoes.gender,
    'color', shoes.color,
    'material', 'EVA',
    'country', '독일'
  ),
  json_array(shoes.source_url),
  products.image_url, 'official-web-verified', shoes.source_url,
  datetime('now'), datetime('now')
FROM products
JOIN (
  SELECT '1027382' AS style_number, 'Birkenstock Boston EVA Eggshell' AS name_en, 'https://www.birkenstock.com/jp/boston-eva/boston-eva-eva-0-eva-u_1631.html' AS source_url, 'Eggshell' AS color, '공용' AS gender
  UNION ALL
  SELECT '1027386', 'Birkenstock Boston EVA Roast Men', 'https://www.birkenstock.com.tr/erkek-kahverengi-kapali-terlik-plaj-grubu-1027386/', 'Roast', '남성용'
) shoes ON lower(products.style_number) = lower(shoes.style_number)
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
