CREATE TABLE `citation_audits` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`uid` text NOT NULL,
	`site_id` integer NOT NULL,
	`page_url` text NOT NULL,
	`status` text NOT NULL,
	`score` integer,
	`tier` text,
	`results` text,
	`error_reason` text,
	`error_message` text,
	`fetch_ms` integer,
	`browser_ms_used` integer,
	`fetched_at` text DEFAULT (current_timestamp) NOT NULL,
	`trigger` text NOT NULL,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `citation_audits_uid_unique` ON `citation_audits` (`uid`);--> statement-breakpoint
CREATE INDEX `cit_audit_by_page_recent` ON `citation_audits` (`site_id`,`page_url`,`fetched_at`);--> statement-breakpoint
CREATE INDEX `cit_audit_by_site_recent` ON `citation_audits` (`site_id`,`fetched_at`);