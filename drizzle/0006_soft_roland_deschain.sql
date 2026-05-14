ALTER TABLE `generations` ADD `summaries_status` text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE `generations` ADD `summaries_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `generations` ADD `summaries_empty_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `generations` ADD `summaries_failed_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `generations` ADD `summaries_manifest_blob_path` text;--> statement-breakpoint
ALTER TABLE `generations` ADD `summaries_error_message` text;