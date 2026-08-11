CREATE TABLE `sales_channel_products` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`channel_id` integer NOT NULL,
	`product_id` integer NOT NULL,
	`featured` integer DEFAULT false NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sales_channel_products_unique` ON `sales_channel_products` (`channel_id`,`product_id`);--> statement-breakpoint
CREATE INDEX `sales_channel_products_channel_sort_idx` ON `sales_channel_products` (`channel_id`,`sort_order`);--> statement-breakpoint
CREATE INDEX `sales_channel_products_product_idx` ON `sales_channel_products` (`product_id`);--> statement-breakpoint
CREATE TABLE `sales_channels` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`operator_name` text DEFAULT '' NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`image_url` text DEFAULT '' NOT NULL,
	`youtube_url` text DEFAULT '' NOT NULL,
	`broadcast_settings` text DEFAULT '{}' NOT NULL,
	`category_settings` text DEFAULT '[]' NOT NULL,
	`view_count` integer DEFAULT 0 NOT NULL,
	`theme_color` text DEFAULT '#111827' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sales_channels_slug_unique` ON `sales_channels` (`slug`);--> statement-breakpoint
CREATE INDEX `sales_channels_status_sort_idx` ON `sales_channels` (`status`,`sort_order`);--> statement-breakpoint
DROP INDEX `products_style_number_unique`;--> statement-breakpoint
CREATE UNIQUE INDEX `products_style_number_unique` ON `products` (`style_number`) WHERE "products"."style_number" != '' AND "products"."status" != 'deleted';--> statement-breakpoint
ALTER TABLE `orders` ADD `channel_id` integer;--> statement-breakpoint
ALTER TABLE `orders` ADD `channel_name` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `carts` ADD `channel_id` integer;
--> statement-breakpoint
ALTER TABLE `carts` ADD `channel_name` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `order_items` ADD `channel_id` integer;
--> statement-breakpoint
ALTER TABLE `order_items` ADD `channel_name` text DEFAULT '' NOT NULL;
