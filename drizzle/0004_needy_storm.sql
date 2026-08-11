CREATE TABLE `referral_flags` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`referral_id` integer NOT NULL,
	`reasons` text NOT NULL,
	`status` text DEFAULT '검토중' NOT NULL,
	`admin_note` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`resolved_at` text
);
--> statement-breakpoint
CREATE TABLE `referral_visits` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`referral_code` text NOT NULL,
	`visitor_token` text NOT NULL,
	`landing_path` text DEFAULT '/' NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `referral_visits_code_idx` ON `referral_visits` (`referral_code`,`created_at`);