CREATE TABLE `page_questions_cache` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`site_id` integer NOT NULL,
	`url_path` text NOT NULL,
	`url` text NOT NULL,
	`content_hash` text NOT NULL,
	`questions` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `page_questions_cache_site_path_unique` ON `page_questions_cache` (`site_id`,`url_path`);