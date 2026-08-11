CREATE TABLE `password_reset_requests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`member_id` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`requested_at` text NOT NULL,
	`completed_at` text
);
--> statement-breakpoint
ALTER TABLE `orders` ADD `idempotency_key` text;--> statement-breakpoint
CREATE UNIQUE INDEX `orders_member_idempotency_idx` ON `orders` (`member_id`,`idempotency_key`) WHERE "orders"."idempotency_key" IS NOT NULL AND "orders"."idempotency_key" != '';