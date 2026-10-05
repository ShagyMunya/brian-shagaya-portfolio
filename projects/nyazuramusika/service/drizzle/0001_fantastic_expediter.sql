CREATE TABLE `admin_actions` (
	`id` text PRIMARY KEY NOT NULL,
	`admin_id` text NOT NULL,
	`action` text NOT NULL,
	`target_id` text NOT NULL,
	`details` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`admin_id`) REFERENCES `sellers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_admin_actions_created` ON `admin_actions` (`created_at`);--> statement-breakpoint
CREATE TABLE `google_auth_requests` (
	`state_hash` text PRIMARY KEY NOT NULL,
	`browser_hash` text NOT NULL,
	`nonce` text NOT NULL,
	`google_verifier` text NOT NULL,
	`challenge` text NOT NULL,
	`app_state` text NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `sellers` ADD `email` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `sellers` ADD `auth_provider` text DEFAULT 'chatgpt' NOT NULL;--> statement-breakpoint
ALTER TABLE `sellers` ADD `role` text DEFAULT 'user' NOT NULL;--> statement-breakpoint
ALTER TABLE `sellers` ADD `account_status` text DEFAULT 'active' NOT NULL;