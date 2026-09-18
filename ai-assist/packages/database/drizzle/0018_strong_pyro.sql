ALTER TYPE "public"."knowledge_processing_run_status" ADD VALUE 'cancelled';--> statement-breakpoint
ALTER TABLE "knowledge_processing_runs" ADD COLUMN "pause_requested_at" timestamp with time zone;