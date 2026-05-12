ALTER TABLE `generations` ADD `pages_manifest_blob_path` text;--> statement-breakpoint
ALTER TABLE `generations` ADD `pages_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `generations` ADD `pages_status` text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE `generations` ADD `pages_error_message` text;