ALTER TABLE `coupons` ADD `coupon_type` text DEFAULT 'point' NOT NULL;--> statement-breakpoint
ALTER TABLE `coupons` ADD `discount_kind` text DEFAULT 'fixed' NOT NULL;--> statement-breakpoint
ALTER TABLE `coupons` ADD `discount_value` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `coupons` ADD `minimum_order` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `coupons` ADD `target_category` text DEFAULT '전체' NOT NULL;--> statement-breakpoint
ALTER TABLE `coupons` ADD `claimed_by` integer;--> statement-breakpoint
ALTER TABLE `coupons` ADD `claimed_at` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `subtotal_points` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `shipping_fee` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `discount_amount` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `coupon_id` integer;--> statement-breakpoint
ALTER TABLE `orders` ADD `benefit_snapshot` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `variants_json` text DEFAULT '[]' NOT NULL;