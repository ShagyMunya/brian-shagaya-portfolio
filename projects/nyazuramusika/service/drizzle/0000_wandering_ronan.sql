CREATE TABLE `auth_codes` (
	`hash` text PRIMARY KEY NOT NULL,
	`seller_id` text NOT NULL,
	`challenge` text NOT NULL,
	`state` text NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`seller_id`) REFERENCES `sellers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `images` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`content_type` text NOT NULL,
	`byte_size` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `sellers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_images_owner` ON `images` (`owner_id`);--> statement-breakpoint
CREATE TABLE `listings` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`category` text NOT NULL,
	`location` text NOT NULL,
	`condition` text NOT NULL,
	`currency` text NOT NULL,
	`price_minor` integer NOT NULL,
	`image_id` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `sellers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`image_id`) REFERENCES `images`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_listings_status_created` ON `listings` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_listings_owner_created` ON `listings` (`owner_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_listings_image` ON `listings` (`image_id`);--> statement-breakpoint
CREATE TABLE `rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`window_ends` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sellers` (
	`id` text PRIMARY KEY NOT NULL,
	`external_id` text NOT NULL,
	`display_name` text DEFAULT '' NOT NULL,
	`whatsapp` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_sellers_external_id` ON `sellers` (`external_id`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`hash` text PRIMARY KEY NOT NULL,
	`seller_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`seller_id`) REFERENCES `sellers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_sessions_seller` ON `sessions` (`seller_id`);