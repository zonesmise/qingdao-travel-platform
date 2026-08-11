ALTER TABLE `orders` ADD `purchase_reward_points` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `purchase_reward_status` text DEFAULT 'none' NOT NULL;