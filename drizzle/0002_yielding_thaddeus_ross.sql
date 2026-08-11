CREATE TABLE `admin_accounts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`username` text NOT NULL,
	`name` text NOT NULL,
	`password_hash` text NOT NULL,
	`role` text DEFAULT 'manager' NOT NULL,
	`permissions` text DEFAULT '["products","members","points","orders","finance","reviews","notices","coupons","inquiries","popups","audit"]' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`force_password_change` integer DEFAULT true NOT NULL,
	`failed_attempts` integer DEFAULT 0 NOT NULL,
	`locked_until` text,
	`last_login_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `admin_accounts_username_unique` ON `admin_accounts` (`username`);--> statement-breakpoint
CREATE TABLE `admin_sessions` (
	`session_hash` text PRIMARY KEY NOT NULL,
	`admin_account_id` integer NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `admin_sessions_account_idx` ON `admin_sessions` (`admin_account_id`);--> statement-breakpoint
CREATE INDEX `admin_sessions_expires_idx` ON `admin_sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `attendance_records` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`member_id` integer NOT NULL,
	`attendance_date` text NOT NULL,
	`streak` integer DEFAULT 1 NOT NULL,
	`base_points` integer DEFAULT 0 NOT NULL,
	`bonus_points` integer DEFAULT 0 NOT NULL,
	`total_points` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `attendance_records_member_idx` ON `attendance_records` (`member_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `attendance_records_member_date_unique` ON `attendance_records` (`member_id`,`attendance_date`);--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`admin_name` text NOT NULL,
	`action` text NOT NULL,
	`target` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `carts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`member_id` integer NOT NULL,
	`product_id` integer NOT NULL,
	`selected_options` text DEFAULT '{}' NOT NULL,
	`quantity` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `coupons` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`point_amount` integer NOT NULL,
	`status` text DEFAULT '미사용' NOT NULL,
	`used_by` integer,
	`used_at` text,
	`expires_at` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `coupons_code_unique` ON `coupons` (`code`);--> statement-breakpoint
CREATE TABLE `finance_requests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`member_id` integer NOT NULL,
	`request_type` text NOT NULL,
	`amount` integer NOT NULL,
	`bank_name` text DEFAULT '' NOT NULL,
	`account_no` text DEFAULT '' NOT NULL,
	`account_holder` text DEFAULT '' NOT NULL,
	`status` text DEFAULT '대기' NOT NULL,
	`memo` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `inquiries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`member_id` integer NOT NULL,
	`product_id` integer,
	`category` text DEFAULT '이용문의' NOT NULL,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`answer` text DEFAULT '' NOT NULL,
	`status` text DEFAULT '접수' NOT NULL,
	`created_at` text NOT NULL,
	`answered_at` text
);
--> statement-breakpoint
CREATE TABLE `member_credentials` (
	`member_id` integer PRIMARY KEY NOT NULL,
	`password_hash` text NOT NULL,
	`failed_attempts` integer DEFAULT 0 NOT NULL,
	`locked_until` text,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `member_identities` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`member_id` integer NOT NULL,
	`provider` text NOT NULL,
	`provider_subject` text NOT NULL,
	`provider_email` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `member_identities_member_idx` ON `member_identities` (`member_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `member_identities_provider_unique` ON `member_identities` (`provider`,`provider_subject`);--> statement-breakpoint
CREATE TABLE `member_sessions` (
	`session_hash` text PRIMARY KEY NOT NULL,
	`member_id` integer NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `member_sessions_member_idx` ON `member_sessions` (`member_id`);--> statement-breakpoint
CREATE INDEX `member_sessions_expires_idx` ON `member_sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `notices` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `point_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`member_id` integer NOT NULL,
	`amount` integer NOT NULL,
	`type` text NOT NULL,
	`memo` text NOT NULL,
	`balance_after` integer NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `popups` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`button_text` text DEFAULT '쇼핑 시작' NOT NULL,
	`link_url` text DEFAULT '/' NOT NULL,
	`background_color` text DEFAULT '#11243e' NOT NULL,
	`image_url` text DEFAULT '' NOT NULL,
	`width` integer DEFAULT 420 NOT NULL,
	`height` integer DEFAULT 460 NOT NULL,
	`position_x` integer DEFAULT 50 NOT NULL,
	`position_y` integer DEFAULT 50 NOT NULL,
	`target` text DEFAULT '_self' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`starts_at` text NOT NULL,
	`ends_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `shipping_addresses` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`member_id` integer NOT NULL,
	`label` text DEFAULT '배송지' NOT NULL,
	`recipient` text NOT NULL,
	`phone` text NOT NULL,
	`postal_code` text DEFAULT '' NOT NULL,
	`address1` text NOT NULL,
	`address_detail` text DEFAULT '' NOT NULL,
	`delivery_request` text DEFAULT '' NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`last_used_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `shipping_addresses_member_idx` ON `shipping_addresses` (`member_id`);--> statement-breakpoint
CREATE INDEX `shipping_addresses_member_default_idx` ON `shipping_addresses` (`member_id`,`is_default`);--> statement-breakpoint
CREATE TABLE `wishlists` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`member_id` integer NOT NULL,
	`product_id` integer NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `carts` (`id`, `member_id`, `product_id`, `selected_options`, `quantity`, `created_at`)
SELECT `id`, `member_id`, `product_id`, '{}', `quantity`, `created_at` FROM `cart_items`;--> statement-breakpoint
INSERT INTO `point_logs` (`id`, `member_id`, `amount`, `type`, `memo`, `balance_after`, `created_at`)
SELECT `id`, `member_id`, `amount`, `type`, `memo`, `balance_after`, `created_at` FROM `point_ledger`;--> statement-breakpoint
INSERT INTO `attendance_records` (`id`, `member_id`, `attendance_date`, `streak`, `base_points`, `bonus_points`, `total_points`, `created_at`)
SELECT `id`, `member_id`, `attendance_date`, 1, `points_awarded`, 0, `points_awarded`, `created_at` FROM `attendance`;--> statement-breakpoint
INSERT INTO `audit_logs` (`id`, `admin_name`, `action`, `target`, `created_at`)
SELECT `id`, '기존 V2 관리자', `action`, `target_type` || ':' || `target_id`, `created_at` FROM `admin_audit_logs`;--> statement-breakpoint
CREATE TABLE `_v2_order_id_map` (
	`new_id` integer PRIMARY KEY NOT NULL,
	`old_id` text NOT NULL UNIQUE
);--> statement-breakpoint
INSERT INTO `_v2_order_id_map` (`new_id`, `old_id`)
SELECT CAST(`rowid` AS integer), `id` FROM `orders`;--> statement-breakpoint
DROP TABLE `admin_audit_logs`;--> statement-breakpoint
DROP TABLE `admin_permissions`;--> statement-breakpoint
DROP TABLE `attendance`;--> statement-breakpoint
DROP TABLE `cart_items`;--> statement-breakpoint
DROP TABLE `categories`;--> statement-breakpoint
DROP TABLE `order_status_history`;--> statement-breakpoint
DROP TABLE `point_ledger`;--> statement-breakpoint
DROP TABLE `referrals`;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_members` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`points` integer DEFAULT 0 NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`joined_at` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_members`("id", "email", "name", "role", "status", "points", "phone", "joined_at")
SELECT "id", "email", "name", "role", "status", "point_balance", "phone", "created_at" FROM `members`;--> statement-breakpoint
DROP TABLE `members`;--> statement-breakpoint
ALTER TABLE `__new_members` RENAME TO `members`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `members_email_unique` ON `members` (`email`);--> statement-breakpoint
CREATE TABLE `__new_orders` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`order_no` text NOT NULL,
	`member_id` integer NOT NULL,
	`total_points` integer NOT NULL,
	`status` text DEFAULT '접수' NOT NULL,
	`recipient` text NOT NULL,
	`phone` text NOT NULL,
	`address` text NOT NULL,
	`memo` text DEFAULT '' NOT NULL,
	`postal_code` text DEFAULT '' NOT NULL,
	`address1` text DEFAULT '' NOT NULL,
	`address_detail` text DEFAULT '' NOT NULL,
	`address_updated_at` text,
	`courier` text DEFAULT '' NOT NULL,
	`tracking_no` text DEFAULT '' NOT NULL,
	`shipped_at` text,
	`delivered_at` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_orders`("id", "order_no", "member_id", "total_points", "status", "recipient", "phone", "address", "memo", "postal_code", "address1", "address_detail", "address_updated_at", "courier", "tracking_no", "shipped_at", "delivered_at", "created_at")
SELECT m.`new_id`, o.`id`, o.`member_id`, o.`total_points`, o.`status`, o.`recipient_name`, o.`phone`,
	trim(o.`postal_code` || ' ' || o.`address1` || ' ' || o.`address2`), o.`memo`, o.`postal_code`, o.`address1`, o.`address2`, o.`updated_at`, '', '', NULL, NULL, o.`created_at`
FROM `orders` o JOIN `_v2_order_id_map` m ON m.`old_id` = o.`id`;--> statement-breakpoint
DROP TABLE `orders`;--> statement-breakpoint
ALTER TABLE `__new_orders` RENAME TO `orders`;--> statement-breakpoint
CREATE UNIQUE INDEX `orders_order_no_unique` ON `orders` (`order_no`);--> statement-breakpoint
CREATE TABLE `__new_reviews` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`member_id` integer NOT NULL,
	`product_id` integer NOT NULL,
	`order_id` integer,
	`order_item_id` integer,
	`rating` integer NOT NULL,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`image_urls` text DEFAULT '[]' NOT NULL,
	`visible` integer DEFAULT true NOT NULL,
	`reward_points` integer DEFAULT 0 NOT NULL,
	`reward_status` text DEFAULT '지급' NOT NULL,
	`rewarded_at` text,
	`revoked_at` text,
	`admin_reply` text DEFAULT '' NOT NULL,
	`answered_at` text,
	`hidden_reason` text DEFAULT '' NOT NULL,
	`deleted_at` text,
	`updated_at` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_reviews`("id", "member_id", "product_id", "order_id", "order_item_id", "rating", "title", "content", "image_urls", "visible", "reward_points", "reward_status", "rewarded_at", "revoked_at", "admin_reply", "answered_at", "hidden_reason", "deleted_at", "updated_at", "created_at")
SELECT r.`id`, r.`member_id`, r.`product_id`, m.`new_id`, NULL, r.`rating`, '기존 후기', r.`content`, '[]',
	CASE WHEN r.`status` = 'published' THEN 1 ELSE 0 END, 0, '지급', NULL, NULL, '', NULL, '', NULL, NULL, r.`created_at`
FROM `reviews` r LEFT JOIN `_v2_order_id_map` m ON m.`old_id` = r.`order_id`;--> statement-breakpoint
DROP TABLE `reviews`;--> statement-breakpoint
ALTER TABLE `__new_reviews` RENAME TO `reviews`;--> statement-breakpoint
CREATE UNIQUE INDEX `reviews_order_item_unique` ON `reviews` (`order_item_id`);--> statement-breakpoint
CREATE TABLE `__new_order_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`order_id` integer NOT NULL,
	`product_id` integer NOT NULL,
	`product_name` text NOT NULL,
	`point_price` integer NOT NULL,
	`selected_options` text DEFAULT '{}' NOT NULL,
	`quantity` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_order_items`("id", "order_id", "product_id", "product_name", "point_price", "selected_options", "quantity")
SELECT oi.`id`, m.`new_id`, oi.`product_id`, oi.`product_name`, oi.`point_price`, '{}', oi.`quantity`
FROM `order_items` oi JOIN `_v2_order_id_map` m ON m.`old_id` = oi.`order_id`;--> statement-breakpoint
DROP TABLE `order_items`;--> statement-breakpoint
ALTER TABLE `__new_order_items` RENAME TO `order_items`;--> statement-breakpoint
CREATE TABLE `__new_products` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`brand` text DEFAULT '' NOT NULL,
	`product_code` text DEFAULT '' NOT NULL,
	`description` text NOT NULL,
	`image_url` text NOT NULL,
	`image_urls` text DEFAULT '[]' NOT NULL,
	`media_json` text DEFAULT '[]' NOT NULL,
	`options_json` text DEFAULT '[]' NOT NULL,
	`detail_content` text DEFAULT '' NOT NULL,
	`shipping_info` text DEFAULT '' NOT NULL,
	`point_price` integer NOT NULL,
	`stock` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`badge` text DEFAULT '' NOT NULL,
	`sales_count` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_products`("id", "name", "category", "brand", "product_code", "description", "image_url", "image_urls", "media_json", "options_json", "detail_content", "shipping_info", "point_price", "stock", "status", "badge", "sales_count", "created_at")
SELECT "id", "name", "category", "brand", 'V2-' || "id", COALESCE(NULLIF("description", ''), "summary", ''), "image_url", '[]', '[]', '[]', '', '', "point_price", "stock",
	CASE WHEN "active" = 1 THEN 'active' ELSE 'inactive' END, COALESCE("badge", ''), 0, "created_at" FROM `products`;--> statement-breakpoint
DROP TABLE `products`;--> statement-breakpoint
ALTER TABLE `__new_products` RENAME TO `products`;--> statement-breakpoint
CREATE TABLE `__new_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_settings`("key", "value", "updated_at") SELECT "key", "value", "updated_at" FROM `settings`;--> statement-breakpoint
DROP TABLE `settings`;--> statement-breakpoint
ALTER TABLE `__new_settings` RENAME TO `settings`;--> statement-breakpoint
DROP TABLE `_v2_order_id_map`;
