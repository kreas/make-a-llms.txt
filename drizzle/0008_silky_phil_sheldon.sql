ALTER TABLE `api_tokens` ADD COLUMN `uid` text;--> statement-breakpoint
CREATE UNIQUE INDEX `api_tokens_uid_unique` ON `api_tokens` (`uid`);--> statement-breakpoint
ALTER TABLE `crawler_audits` ADD COLUMN `uid` text;--> statement-breakpoint
CREATE UNIQUE INDEX `crawler_audits_uid_unique` ON `crawler_audits` (`uid`);--> statement-breakpoint
ALTER TABLE `generations` ADD COLUMN `uid` text;--> statement-breakpoint
CREATE UNIQUE INDEX `generations_uid_unique` ON `generations` (`uid`);--> statement-breakpoint
ALTER TABLE `otp_codes` ADD COLUMN `uid` text;--> statement-breakpoint
CREATE UNIQUE INDEX `otp_codes_uid_unique` ON `otp_codes` (`uid`);--> statement-breakpoint
ALTER TABLE `robots_generator_drafts` ADD COLUMN `uid` text;--> statement-breakpoint
CREATE UNIQUE INDEX `robots_generator_drafts_uid_unique` ON `robots_generator_drafts` (`uid`);--> statement-breakpoint
ALTER TABLE `sites` ADD COLUMN `uid` text;--> statement-breakpoint
CREATE UNIQUE INDEX `sites_uid_unique` ON `sites` (`uid`);--> statement-breakpoint
ALTER TABLE `users` ADD COLUMN `uid` text;--> statement-breakpoint
CREATE UNIQUE INDEX `users_uid_unique` ON `users` (`uid`);
