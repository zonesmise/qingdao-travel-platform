ALTER TABLE `orders` ADD `cash_payment_channel` text DEFAULT '' NOT NULL;--> statement-breakpoint
UPDATE `members`
SET `reward_points` = `reward_points` + (`points` - `charge_points` - `reward_points`)
WHERE `points` > `charge_points` + `reward_points`;
