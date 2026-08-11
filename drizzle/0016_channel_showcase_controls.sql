ALTER TABLE `sales_channels` ADD `showcase_visible` integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE `sales_channels` ADD `showcase_order` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
CREATE INDEX `sales_channels_showcase_idx` ON `sales_channels` (`showcase_visible`,`showcase_order`);
