CREATE TABLE `referral_codes` (
	`member_id` integer PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `referral_codes_code_unique` ON `referral_codes` (`code`);--> statement-breakpoint
CREATE TABLE `referrals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`inviter_id` integer NOT NULL,
	`invitee_id` integer NOT NULL,
	`referral_code` text NOT NULL,
	`status` text DEFAULT '가입완료' NOT NULL,
	`joined_at` text NOT NULL,
	`verified_at` text,
	`first_order_id` integer,
	`eligible_at` text,
	`confirmed_at` text,
	`canceled_at` text,
	`hold_reason` text DEFAULT '' NOT NULL,
	`policy_json` text DEFAULT '{}' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `referrals_invitee_id_unique` ON `referrals` (`invitee_id`);--> statement-breakpoint
CREATE INDEX `referrals_inviter_idx` ON `referrals` (`inviter_id`,`joined_at`);--> statement-breakpoint
CREATE TABLE `reward_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`member_id` integer NOT NULL,
	`referral_id` integer,
	`order_id` integer,
	`source_type` text NOT NULL,
	`beneficiary_role` text DEFAULT 'member' NOT NULL,
	`amount` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`available_at` text,
	`expires_at` text,
	`memo` text NOT NULL,
	`policy_json` text DEFAULT '{}' NOT NULL,
	`created_at` text NOT NULL,
	`confirmed_at` text,
	`revoked_at` text
);
--> statement-breakpoint
CREATE INDEX `reward_events_member_idx` ON `reward_events` (`member_id`,`status`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `reward_events_unique_source` ON `reward_events` (`member_id`,`source_type`,`referral_id`,`beneficiary_role`);--> statement-breakpoint
ALTER TABLE `members` ADD `charge_points` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `members` ADD `reward_points` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `members` ADD `pending_reward_points` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `members` ADD `email_verified` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `members` ADD `phone_verified` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `used_charge_points` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `used_reward_points` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `point_logs` ADD `point_bucket` text DEFAULT 'charge' NOT NULL;--> statement-breakpoint
ALTER TABLE `point_logs` ADD `reward_event_id` integer;