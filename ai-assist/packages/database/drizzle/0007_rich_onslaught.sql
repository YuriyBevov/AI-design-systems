CREATE TYPE "public"."knowledge_crawl_change_type" AS ENUM('new', 'changed', 'unchanged');--> statement-breakpoint
CREATE TYPE "public"."knowledge_crawl_page_status" AS ENUM('succeeded', 'failed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."knowledge_crawl_review_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."knowledge_crawl_run_status" AS ENUM('queued', 'running', 'succeeded', 'partial', 'failed', 'cancelled');--> statement-breakpoint
CREATE TABLE "knowledge_crawl_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"normalized_url" varchar(2048) NOT NULL,
	"depth" integer NOT NULL,
	"status" "knowledge_crawl_page_status" NOT NULL,
	"http_status" integer,
	"content_type" varchar(255),
	"document_id" uuid,
	"document_version_id" uuid,
	"change_type" "knowledge_crawl_change_type",
	"document_type" "knowledge_document_type",
	"title" varchar(500),
	"content_checksum" varchar(64),
	"confidence" double precision,
	"warnings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"error_code" varchar(100),
	"retryable" boolean DEFAULT false NOT NULL,
	"review_status" "knowledge_crawl_review_status" DEFAULT 'pending' NOT NULL,
	"fetched_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_crawl_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"status" "knowledge_crawl_run_status" DEFAULT 'queued' NOT NULL,
	"discovered_count" integer DEFAULT 0 NOT NULL,
	"processed_count" integer DEFAULT 0 NOT NULL,
	"succeeded_count" integer DEFAULT 0 NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"new_count" integer DEFAULT 0 NOT NULL,
	"changed_count" integer DEFAULT 0 NOT NULL,
	"unchanged_count" integer DEFAULT 0 NOT NULL,
	"approved_count" integer DEFAULT 0 NOT NULL,
	"profile_version" varchar(100) NOT NULL,
	"error_code" varchar(100),
	"requested_by" uuid,
	"request_id" varchar(128) NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "knowledge_documents" ADD COLUMN "source_external_id" varchar(64);--> statement-breakpoint
ALTER TABLE "knowledge_sources" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "knowledge_sources" ADD COLUMN "last_crawled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "knowledge_sources" ADD COLUMN "last_successful_crawl_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "knowledge_sources" ADD COLUMN "last_error_code" varchar(100);--> statement-breakpoint
ALTER TABLE "knowledge_crawl_pages" ADD CONSTRAINT "knowledge_crawl_pages_run_id_knowledge_crawl_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."knowledge_crawl_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_crawl_pages" ADD CONSTRAINT "knowledge_crawl_pages_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_crawl_pages" ADD CONSTRAINT "knowledge_crawl_pages_document_id_knowledge_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."knowledge_documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_crawl_pages" ADD CONSTRAINT "knowledge_crawl_pages_document_version_id_knowledge_document_versions_id_fk" FOREIGN KEY ("document_version_id") REFERENCES "public"."knowledge_document_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_crawl_runs" ADD CONSTRAINT "knowledge_crawl_runs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_crawl_runs" ADD CONSTRAINT "knowledge_crawl_runs_source_id_knowledge_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."knowledge_sources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_crawl_runs" ADD CONSTRAINT "knowledge_crawl_runs_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_crawl_pages_run_url_uidx" ON "knowledge_crawl_pages" USING btree ("run_id","normalized_url");--> statement-breakpoint
CREATE INDEX "knowledge_crawl_pages_project_run_idx" ON "knowledge_crawl_pages" USING btree ("project_id","run_id");--> statement-breakpoint
CREATE INDEX "knowledge_crawl_pages_run_review_idx" ON "knowledge_crawl_pages" USING btree ("run_id","review_status");--> statement-breakpoint
CREATE INDEX "knowledge_crawl_runs_project_created_idx" ON "knowledge_crawl_runs" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE INDEX "knowledge_crawl_runs_source_created_idx" ON "knowledge_crawl_runs" USING btree ("source_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_crawl_runs_source_pending_uidx" ON "knowledge_crawl_runs" USING btree ("source_id") WHERE "knowledge_crawl_runs"."status" in ('queued', 'running');--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_documents_source_external_uidx" ON "knowledge_documents" USING btree ("source_id","source_external_id") WHERE "knowledge_documents"."source_external_id" is not null;