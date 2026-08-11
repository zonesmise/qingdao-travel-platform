CREATE INDEX IF NOT EXISTS `products_status_sales_idx`
ON `products` (`status`, `sales_count`, `id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `products_status_category_idx`
ON `products` (`status`, `category`, `id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `reviews_product_visibility_idx`
ON `reviews` (`product_id`, `visible`, `deleted_at`);
