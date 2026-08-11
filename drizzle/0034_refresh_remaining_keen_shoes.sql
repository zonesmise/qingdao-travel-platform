WITH RECURSIVE
  image_numbers(value) AS (VALUES (1) UNION ALL SELECT value + 1 FROM image_numbers WHERE value < 5),
  keen_shoes(style_number, name, image_count, description, detail_content) AS (
    VALUES
      ('1004337', '킨 재스퍼 캐세이 스파이스/오리온 블루 여성용', 3, '캐세이 스파이스와 오리온 블루 색상의 여성용 KEEN 재스퍼입니다.', '클라이밍화에서 영감을 받은 여성용 스니커즈로, 스웨이드 어퍼와 메쉬 안감, 고무 아웃솔을 사용했습니다.'),
      ('1004347', '킨 재스퍼 실버 밍크 여성용', 5, '실버 밍크 색상의 여성용 KEEN 재스퍼입니다.', '클라이밍화에서 영감을 받은 여성용 스니커즈로, 스웨이드 어퍼와 메쉬 안감, 논마킹 고무 아웃솔을 사용했습니다.')
  )
UPDATE products
SET
  name = (SELECT name FROM keen_shoes WHERE keen_shoes.style_number = products.style_number),
  category = '신발',
  brand = '킨 (KEEN)',
  description = (SELECT description FROM keen_shoes WHERE keen_shoes.style_number = products.style_number),
  image_url = '/catalog/shoes/' || products.style_number || '/01.webp',
  image_urls = (
    SELECT json_group_array('/catalog/shoes/' || products.style_number || '/' || printf('%02d', image_numbers.value) || '.webp')
    FROM image_numbers
    WHERE image_numbers.value <= (SELECT image_count FROM keen_shoes WHERE keen_shoes.style_number = products.style_number)
  ),
  detail_content = (SELECT detail_content FROM keen_shoes WHERE keen_shoes.style_number = products.style_number),
  point_price = 999,
  stock = 999,
  status = 'active'
WHERE style_number IN ('1004337', '1004347')
  AND status != 'deleted';
--> statement-breakpoint
WITH keen_details(style_number, name_en, source_url, color, material, country) AS (
  VALUES
    ('1004337', 'KEEN Jasper Cathay Spice/Orion Blue Women', 'https://www.keenfootwear.it/products/jasper-scarpe-donna-cathay-spice-orion-blue-1004337', '캐세이 스파이스/오리온 블루', '스웨이드·메쉬·고무', ''),
    ('1004347', 'KEEN Jasper Silver Mink Women', 'https://m.keenfootwear.kr/goods/goods_view.php?goodsNo=1000000448', '실버 밍크', '스웨이드·메쉬·고무', '태국')
)
UPDATE product_catalog_details
SET
  name_en = (SELECT name_en FROM keen_details JOIN products ON products.style_number = keen_details.style_number WHERE products.id = product_catalog_details.product_id),
  subcategory = '스니커즈',
  product_type = 'shoes',
  sale_price = 999,
  points_price = 999,
  type_fields_json = (
    SELECT json_object('gender', '여성용', 'color', keen_details.color, 'material', keen_details.material, 'country', keen_details.country)
    FROM keen_details JOIN products ON products.style_number = keen_details.style_number
    WHERE products.id = product_catalog_details.product_id
  ),
  search_sources_json = (
    SELECT json_array(keen_details.source_url)
    FROM keen_details JOIN products ON products.style_number = keen_details.style_number
    WHERE products.id = product_catalog_details.product_id
  ),
  thumbnail_url = (SELECT image_url FROM products WHERE products.id = product_catalog_details.product_id),
  source_kind = 'web-verified',
  source_reference = (
    SELECT keen_details.source_url
    FROM keen_details JOIN products ON products.style_number = keen_details.style_number
    WHERE products.id = product_catalog_details.product_id
  ),
  updated_at = datetime('now')
WHERE product_id IN (
  SELECT products.id FROM products WHERE products.style_number IN ('1004337', '1004347') AND products.status != 'deleted'
);
