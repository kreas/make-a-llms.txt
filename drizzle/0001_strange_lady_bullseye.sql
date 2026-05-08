CREATE TABLE `generations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`site_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`trigger` text NOT NULL,
	`notify_email` integer DEFAULT false NOT NULL,
	`notified_at` text,
	`workflow_run_id` text,
	`resolved_sitemap_url` text,
	`llms_blob_path` text,
	`llms_full_blob_path` text,
	`error_message` text,
	`started_at` text,
	`completed_at` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `gen_by_site_recent` ON `generations` (`site_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `sites` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`name` text NOT NULL,
	`root_url` text NOT NULL,
	`sitemap_url` text,
	`webhook_token_hash` text NOT NULL,
	`webhook_token_prefix` text NOT NULL,
	`last_generated_at` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sites_webhook_token_hash_unique` ON `sites` (`webhook_token_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `sites_user_root_unique` ON `sites` (`user_id`,`root_url`);