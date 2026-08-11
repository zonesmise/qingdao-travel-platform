ALTER TABLE `shipping_addresses` ADD `customs_code_encrypted` text DEFAULT '' NOT NULL;
ALTER TABLE `shipping_addresses` ADD `customs_code_masked` text DEFAULT '' NOT NULL;
ALTER TABLE `shipping_addresses` ADD `customs_verified_at` text;
ALTER TABLE `shipping_addresses` ADD `customs_expires_at` text;
ALTER TABLE `shipping_addresses` ADD `customs_save_consent_at` text;
ALTER TABLE `orders` ADD `delivery_stage` text DEFAULT 'payment_confirmed' NOT NULL;
ALTER TABLE `orders` ADD `international_tracking_no` text DEFAULT '' NOT NULL;
ALTER TABLE `orders` ADD `customs_status` text DEFAULT 'waiting' NOT NULL;
ALTER TABLE `orders` ADD `customs_code_encrypted` text DEFAULT '' NOT NULL;
ALTER TABLE `orders` ADD `customs_code_masked` text DEFAULT '' NOT NULL;
ALTER TABLE `orders` ADD `customs_verified_at` text;
ALTER TABLE `orders` ADD `customs_expires_at` text;
CREATE TABLE `order_claims` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `order_id` integer NOT NULL,
  `member_id` integer NOT NULL,
  `claim_type` text NOT NULL,
  `reason_type` text NOT NULL,
  `reason_detail` text DEFAULT '' NOT NULL,
  `evidence_json` text DEFAULT '[]' NOT NULL,
  `cost_bearer` text DEFAULT 'review' NOT NULL,
  `return_fee` integer DEFAULT 0 NOT NULL,
  `status` text DEFAULT 'requested' NOT NULL,
  `admin_note` text DEFAULT '' NOT NULL,
  `requested_at` text NOT NULL,
  `updated_at` text NOT NULL,
  `completed_at` text
);
CREATE INDEX `order_claims_member_idx` ON `order_claims` (`member_id`,`requested_at`);
CREATE INDEX `order_claims_order_idx` ON `order_claims` (`order_id`,`status`);
