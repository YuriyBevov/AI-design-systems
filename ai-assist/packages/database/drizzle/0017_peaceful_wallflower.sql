CREATE TYPE "public"."knowledge_processing_item_status" AS ENUM('queued', 'succeeded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."knowledge_processing_run_status" AS ENUM('queued', 'running', 'succeeded', 'partial', 'failed');--> statement-breakpoint
CREATE TABLE "knowledge_processing_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"status" "knowledge_processing_item_status" DEFAULT 'queued' NOT NULL,
	"source_version_id" uuid NOT NULL,
	"result_version_id" uuid,
	"error_code" varchar(100),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_processing_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"status" "knowledge_processing_run_status" DEFAULT 'queued' NOT NULL,
	"instruction" text NOT NULL,
	"total_count" integer DEFAULT 0 NOT NULL,
	"processed_count" integer DEFAULT 0 NOT NULL,
	"succeeded_count" integer DEFAULT 0 NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"error_code" varchar(100),
	"requested_by" uuid,
	"request_id" varchar(128) NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "knowledge_processing_items" ADD CONSTRAINT "knowledge_processing_items_run_id_knowledge_processing_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."knowledge_processing_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_processing_items" ADD CONSTRAINT "knowledge_processing_items_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_processing_items" ADD CONSTRAINT "knowledge_processing_items_document_id_knowledge_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."knowledge_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_processing_items" ADD CONSTRAINT "knowledge_processing_items_source_version_id_knowledge_document_versions_id_fk" FOREIGN KEY ("source_version_id") REFERENCES "public"."knowledge_document_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_processing_items" ADD CONSTRAINT "knowledge_processing_items_result_version_id_knowledge_document_versions_id_fk" FOREIGN KEY ("result_version_id") REFERENCES "public"."knowledge_document_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_processing_runs" ADD CONSTRAINT "knowledge_processing_runs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_processing_runs" ADD CONSTRAINT "knowledge_processing_runs_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_processing_items_run_document_uidx" ON "knowledge_processing_items" USING btree ("run_id","document_id");--> statement-breakpoint
CREATE INDEX "knowledge_processing_items_project_run_idx" ON "knowledge_processing_items" USING btree ("project_id","run_id");--> statement-breakpoint
CREATE INDEX "knowledge_processing_runs_project_created_idx" ON "knowledge_processing_runs" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_processing_runs_project_pending_uidx" ON "knowledge_processing_runs" USING btree ("project_id") WHERE "knowledge_processing_runs"."status" in ('queued', 'running');