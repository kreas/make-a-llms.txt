CREATE TABLE `page_question_answers_cache` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`site_id` integer NOT NULL,
	`url_path` text NOT NULL,
	`question` text NOT NULL,
	`model` text NOT NULL,
	`content_hash` text NOT NULL,
	`answer` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `page_question_answers_cache_site_path_q_model_unique` ON `page_question_answers_cache` (`site_id`,`url_path`,`question`,`model`);