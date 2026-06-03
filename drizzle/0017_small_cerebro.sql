ALTER TABLE `site_geo_audits` ADD `crawl_job_id` text;--> statement-breakpoint
ALTER TABLE `site_geo_audits` ADD `workflow_run_id` text;--> statement-breakpoint
ALTER TABLE `site_geo_audits` ADD `stage` text;--> statement-breakpoint
ALTER TABLE `site_geo_audits` ADD `site_type` text;--> statement-breakpoint
ALTER TABLE `site_geo_audits` ADD `goal` text;--> statement-breakpoint
ALTER TABLE `sites` ADD `site_type` text;--> statement-breakpoint
ALTER TABLE `sites` ADD `geo_goal` text;