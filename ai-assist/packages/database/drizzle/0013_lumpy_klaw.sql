ALTER TABLE "knowledge_crawl_pages" ADD COLUMN "raw_title" varchar(500);--> statement-breakpoint
ALTER TABLE "knowledge_crawl_pages" ADD COLUMN "raw_content" text;--> statement-breakpoint
ALTER TABLE "knowledge_crawl_runs" ADD COLUMN "normalization_prompt" text;