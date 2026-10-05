CREATE TABLE `favorites` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`listing_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `sellers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`listing_id`) REFERENCES `listings`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_favorites_account_listing` ON `favorites` (`account_id`,`listing_id`);--> statement-breakpoint
CREATE TABLE `live_checks` (
	`id` text PRIMARY KEY NOT NULL,
	`listing_id` text NOT NULL,
	`buyer_id` text NOT NULL,
	`seller_id` text NOT NULL,
	`status` text DEFAULT 'requested' NOT NULL,
	`offer` text,
	`answer` text,
	`buyer_candidates` text DEFAULT '[]' NOT NULL,
	`seller_candidates` text DEFAULT '[]' NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`inspected_at` integer,
	FOREIGN KEY (`listing_id`) REFERENCES `listings`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`buyer_id`) REFERENCES `sellers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`seller_id`) REFERENCES `sellers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_live_checks_buyer` ON `live_checks` (`buyer_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_live_checks_seller` ON `live_checks` (`seller_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `live_sessions` (
	`hash` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`check_id` text NOT NULL,
	`parent_session_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `sellers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`check_id`) REFERENCES `live_checks`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `live_tickets` (
	`hash` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`check_id` text NOT NULL,
	`parent_session_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `sellers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`check_id`) REFERENCES `live_checks`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `orders` (
	`id` text PRIMARY KEY NOT NULL,
	`client_request_id` text NOT NULL,
	`live_check_id` text NOT NULL,
	`listing_id` text NOT NULL,
	`buyer_id` text NOT NULL,
	`seller_id` text NOT NULL,
	`title` text NOT NULL,
	`price_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`payee_phone` text NOT NULL,
	`buyer_name` text NOT NULL,
	`seller_name` text NOT NULL,
	`payment_state` text DEFAULT 'awaiting_payment' NOT NULL,
	`payment_reference` text DEFAULT '' NOT NULL,
	`confirmed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`live_check_id`) REFERENCES `live_checks`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`listing_id`) REFERENCES `listings`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`buyer_id`) REFERENCES `sellers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`seller_id`) REFERENCES `sellers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_orders_request` ON `orders` (`buyer_id`,`client_request_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_orders_check` ON `orders` (`buyer_id`,`live_check_id`);--> statement-breakpoint
CREATE INDEX `idx_orders_seller` ON `orders` (`seller_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `sellers` ADD `ecocash_phone` text DEFAULT '' NOT NULL;