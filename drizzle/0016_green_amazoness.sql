CREATE TABLE `site_geo_audits` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`uid` text NOT NULL,
	`site_id` integer NOT NULL,
	`generation_id` integer,
	`status` text NOT NULL,
	`score` integer,
	`tier` text,
	`results` text,
	`error_reason` text,
	`error_message` text,
	`llm_ms_used` integer,
	`fetched_at` text DEFAULT (current_timestamp) NOT NULL,
	`trigger` text NOT NULL,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`generation_id`) REFERENCES `generations`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `site_geo_audits_uid_unique` ON `site_geo_audits` (`uid`);--> statement-breakpoint
CREATE INDEX `geo_audit_by_site_recent` ON `site_geo_audits` (`site_id`,`fetched_at`);