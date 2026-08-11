ALTER TABLE `orders` ADD `payment_method` text DEFAULT 'points' NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `payment_status` text DEFAULT 'paid' NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `cash_amount` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `point_reservation_status` text DEFAULT 'captured' NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `payment_expires_at` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `payment_confirmed_at` text;--> statement-breakpoint
ALTER TABLE `products` ADD `point_usage_mode` text DEFAULT 'full' NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `point_max_percent` integer DEFAULT 100 NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `cash_payment_enabled` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `reward_on_cash_only` integer DEFAULT true NOT NULL;