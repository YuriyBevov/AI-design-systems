CREATE TYPE "public"."knowledge_document_status" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "public"."knowledge_document_type" AS ENUM('page', 'manual', 'product');--> statement-breakpoint
CREATE TYPE "public"."knowledge_source_status" AS ENUM('active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."knowledge_source_type" AS ENUM('feed', 'url', 'manual', 'product');--> statement-breakpoint
CREATE TABLE "knowledge_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"document_version_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"plain_text" text NOT NULL,
	"token_count" integer NOT NULL,
	"content_checksum" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_document_publications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"document_version_id" uuid NOT NULL,
	"published_by" uuid,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_document_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"version_no" integer NOT NULL,
	"title" varchar(500) NOT NULL,
	"canonical_url" varchar(2048),
	"locale" varchar(16) NOT NULL,
	"plain_text" text NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"content_checksum" varchar(64) NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"type" "knowledge_document_type" NOT NULL,
	"status" "knowledge_document_status" DEFAULT 'draft' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"active_version_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_products" (
	"document_version_id" uuid PRIMARY KEY NOT NULL,
	"external_id" varchar(255),
	"sku" varchar(255),
	"category" varchar(500),
	"price_display" varchar(255),
	"price_amount" numeric(18, 2),
	"currency" varchar(3),
	"availability" varchar(255),
	"minimum_order" numeric(18, 3),
	"characteristics" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"type" "knowledge_source_type" NOT NULL,
	"name" varchar(160) NOT NULL,
	"status" "knowledge_source_status" DEFAULT 'active' NOT NULL,
	"system_key" varchar(80),
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "knowledge_chunks" ADD CONSTRAINT "knowledge_chunks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_chunks" ADD CONSTRAINT "knowledge_chunks_document_version_id_knowledge_document_versions_id_fk" FOREIGN KEY ("document_version_id") REFERENCES "public"."knowledge_document_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_document_publications" ADD CONSTRAINT "knowledge_document_publications_document_id_knowledge_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."knowledge_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_document_publications" ADD CONSTRAINT "knowledge_document_publications_document_version_id_knowledge_document_versions_id_fk" FOREIGN KEY ("document_version_id") REFERENCES "public"."knowledge_document_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_document_publications" ADD CONSTRAINT "knowledge_document_publications_published_by_users_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_document_versions" ADD CONSTRAINT "knowledge_document_versions_document_id_knowledge_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."knowledge_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_document_versions" ADD CONSTRAINT "knowledge_document_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_documents" ADD CONSTRAINT "knowledge_documents_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_documents" ADD CONSTRAINT "knowledge_documents_source_id_knowledge_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."knowledge_sources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_documents" ADD CONSTRAINT "knowledge_documents_active_version_id_knowledge_document_versions_id_fk" FOREIGN KEY ("active_version_id") REFERENCES "public"."knowledge_document_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_products" ADD CONSTRAINT "knowledge_products_document_version_id_knowledge_document_versions_id_fk" FOREIGN KEY ("document_version_id") REFERENCES "public"."knowledge_document_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_sources" ADD CONSTRAINT "knowledge_sources_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_chunks_version_ordinal_uidx" ON "knowledge_chunks" USING btree ("document_version_id","ordinal");--> statement-breakpoint
CREATE INDEX "knowledge_chunks_project_version_idx" ON "knowledge_chunks" USING btree ("project_id","document_version_id");--> statement-breakpoint
CREATE INDEX "knowledge_document_publications_document_published_idx" ON "knowledge_document_publications" USING btree ("document_id","published_at");--> statement-breakpoint
CREATE INDEX "knowledge_document_publications_version_idx" ON "knowledge_document_publications" USING btree ("document_version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_document_versions_document_version_uidx" ON "knowledge_document_versions" USING btree ("document_id","version_no");--> statement-breakpoint
CREATE INDEX "knowledge_document_versions_document_created_idx" ON "knowledge_document_versions" USING btree ("document_id","created_at");--> statement-breakpoint
CREATE INDEX "knowledge_documents_project_status_idx" ON "knowledge_documents" USING btree ("project_id","status");--> statement-breakpoint
CREATE INDEX "knowledge_documents_source_idx" ON "knowledge_documents" USING btree ("source_id");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_sources_project_system_key_uidx" ON "knowledge_sources" USING btree ("project_id","system_key");--> statement-breakpoint
CREATE INDEX "knowledge_sources_project_status_idx" ON "knowledge_sources" USING btree ("project_id","status");
