CREATE TABLE `page_summary_cache` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`site_id` integer NOT NULL,
	`url_path` text NOT NULL,
	`url` text NOT NULL,
	`content_hash` text NOT NULL,
	`summary` text NOT NULL,
	`page_type` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `page_summary_cache_site_path_unique` ON `page_summary_cache` (`site_id`,`url_path`);