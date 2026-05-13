CREATE TABLE `crawler_audits` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`site_id` integer NOT NULL,
	`status` text NOT NULL,
	`robots_url` text NOT NULL,
	`robots_content` text,
	`results` text NOT NULL,
	`error_message` text,
	`fetched_at` text DEFAULT (current_timestamp) NOT NULL,
	`trigger` text NOT NULL,
	`generation_id` integer,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`generation_id`) REFERENCES `generations`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `crawler_audits_by_site_recent` ON `crawler_audits` (`site_id`,`fetched_at`);