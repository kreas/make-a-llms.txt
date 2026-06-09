CREATE TABLE `site_tasks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`uid` text NOT NULL,
	`site_id` integer NOT NULL,
	`source_type` text NOT NULL,
	`source_id` text NOT NULL,
	`page_url` text DEFAULT '' NOT NULL,
	`title` text NOT NULL,
	`found_text` text DEFAULT '' NOT NULL,
	`fix_text` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`status_changed_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `site_tasks_uid_unique` ON `site_tasks` (`uid`);--> statement-breakpoint
CREATE INDEX `site_tasks_by_site_status` ON `site_tasks` (`site_id`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `site_tasks_source_key` ON `site_tasks` (`site_id`,`source_type`,`source_id`,`page_url`);