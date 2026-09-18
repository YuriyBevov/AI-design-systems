ALTER TABLE "knowledge_processing_items" ADD COLUMN "attempt_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE "knowledge_processing_items"
SET "attempt_count" = 1
WHERE "status" IN ('succeeded', 'failed');
