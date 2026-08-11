export const PRODUCT_LIST_COLUMNS = `
  p.id, p.name, p.category, p.brand, p.product_code, p.style_number,
  p.description, p.image_url, p.options_json,
  p.point_price, p.point_usage_mode, p.point_max_percent,
  p.cash_payment_enabled, p.reward_on_cash_only, p.stock, p.status,
  p.badge, p.sales_count, p.created_at, d.subcategory,
  COALESCE(rv.rating, 0) AS rating,
  COALESCE(rv.review_count, 0) AS review_count`;

export const PRODUCT_REVIEW_JOIN = `
  LEFT JOIN (
    SELECT product_id, AVG(rating) AS rating, COUNT(*) AS review_count
    FROM reviews
    WHERE visible = 1 AND deleted_at IS NULL
    GROUP BY product_id
  ) rv ON rv.product_id = p.id`;

// Category and search resolution only needs compact scalar fields. Keeping
// this separate from PRODUCT_LIST_COLUMNS prevents public listing requests
// from materializing every product description and option payload before the
// requested page is known.
export const PRODUCT_CATALOG_INDEX_COLUMNS = `
  p.id, p.name, p.category, p.brand, p.product_code, p.style_number,
  p.status, p.sales_count, p.created_at, d.subcategory`;
