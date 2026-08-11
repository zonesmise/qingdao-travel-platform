CREATE TABLE `ai_product_tasks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`brand` text DEFAULT '' NOT NULL,
	`model_number` text NOT NULL,
	`base_category` text DEFAULT '신발' NOT NULL,
	`product_type` text DEFAULT 'shoes' NOT NULL,
	`search_status` text DEFAULT 'unsearched' NOT NULL,
	`registration_status` text DEFAULT 'pending' NOT NULL,
	`search_cache_key` text DEFAULT '' NOT NULL,
	`registered_product_id` integer,
	`last_error` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ai_product_tasks_brand_model_unique` ON `ai_product_tasks` (`brand`,`model_number`);--> statement-breakpoint
CREATE INDEX `ai_product_tasks_status_idx` ON `ai_product_tasks` (`registration_status`,`search_status`,`id`);--> statement-breakpoint
CREATE TABLE `product_catalog_details` (
	`product_id` integer PRIMARY KEY NOT NULL,
	`name_en` text DEFAULT '' NOT NULL,
	`product_type` text DEFAULT 'accessories' NOT NULL,
	`sale_price` integer DEFAULT 0 NOT NULL,
	`points_price` integer DEFAULT 0 NOT NULL,
	`featured` integer DEFAULT false NOT NULL,
	`type_fields_json` text DEFAULT '{}' NOT NULL,
	`search_sources_json` text DEFAULT '[]' NOT NULL,
	`thumbnail_url` text DEFAULT '' NOT NULL,
	`source_kind` text DEFAULT 'manual' NOT NULL,
	`source_reference` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `product_catalog_details_type_idx` ON `product_catalog_details` (`product_type`,`product_id`);--> statement-breakpoint
CREATE TABLE `product_search_cache` (
	`cache_key` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`query` text NOT NULL,
	`result_json` text NOT NULL,
	`source_urls_json` text DEFAULT '[]' NOT NULL,
	`searched_at` text NOT NULL,
	`expires_at` text
);
--> statement-breakpoint
CREATE INDEX `product_search_cache_searched_idx` ON `product_search_cache` (`searched_at`);