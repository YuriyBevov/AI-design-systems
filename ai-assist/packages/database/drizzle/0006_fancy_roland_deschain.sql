CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE TYPE "public"."knowledge_index_status" AS ENUM('queued', 'building', 'active', 'superseded', 'failed');--> statement-breakpoint
CREATE TABLE "knowledge_index_embeddings" (
	"index_version_id" uuid NOT NULL,
	"knowledge_chunk_id" uuid NOT NULL,
	"embedding" vector NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "knowledge_index_embeddings_index_version_id_knowledge_chunk_id_pk" PRIMARY KEY("index_version_id","knowledge_chunk_id")
);
--> statement-breakpoint
CREATE TABLE "knowledge_index_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"status" "knowledge_index_status" DEFAULT 'queued' NOT NULL,
	"embedding_model_id" varchar(255) NOT NULL,
	"embedding_dimension" integer,
	"source_fingerprint" varchar(64),
	"document_count" integer DEFAULT 0 NOT NULL,
	"chunk_count" integer DEFAULT 0 NOT NULL,
	"input_tokens" integer,
	"error_code" varchar(100),
	"requested_by" uuid,
	"request_id" varchar(128) NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"activated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "knowledge_index_embeddings" ADD CONSTRAINT "knowledge_index_embeddings_index_version_id_knowledge_index_versions_id_fk" FOREIGN KEY ("index_version_id") REFERENCES "public"."knowledge_index_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_index_embeddings" ADD CONSTRAINT "knowledge_index_embeddings_knowledge_chunk_id_knowledge_chunks_id_fk" FOREIGN KEY ("knowledge_chunk_id") REFERENCES "public"."knowledge_chunks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_index_versions" ADD CONSTRAINT "knowledge_index_versions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_index_versions" ADD CONSTRAINT "knowledge_index_versions_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "knowledge_index_embeddings_chunk_idx" ON "knowledge_index_embeddings" USING btree ("knowledge_chunk_id");--> statement-breakpoint
CREATE INDEX "knowledge_index_versions_project_created_idx" ON "knowledge_index_versions" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_index_versions_project_active_uidx" ON "knowledge_index_versions" USING btree ("project_id") WHERE "knowledge_index_versions"."status" = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_index_versions_project_pending_uidx" ON "knowledge_index_versions" USING btree ("project_id") WHERE "knowledge_index_versions"."status" in ('queued', 'building');
