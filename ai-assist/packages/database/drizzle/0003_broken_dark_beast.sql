CREATE TYPE "public"."assistant_status" AS ENUM('draft', 'active', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."prompt_status" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "public"."prompt_type" AS ENUM('system');--> statement-breakpoint
CREATE TABLE "assistant_publications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assistant_id" uuid NOT NULL,
	"prompt_revision_id" uuid NOT NULL,
	"supersedes_id" uuid,
	"model_settings_snapshot" jsonb NOT NULL,
	"published_by" uuid,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assistants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"public_id" varchar(80) NOT NULL,
	"status" "assistant_status" DEFAULT 'draft' NOT NULL,
	"active_publication_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prompt_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"prompt_id" uuid NOT NULL,
	"revision_no" integer NOT NULL,
	"content" text NOT NULL,
	"variables" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"content_checksum" varchar(64) NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prompts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"type" "prompt_type" DEFAULT 'system' NOT NULL,
	"name" varchar(160) NOT NULL,
	"description" text,
	"status" "prompt_status" DEFAULT 'draft' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assistant_publications" ADD CONSTRAINT "assistant_publications_assistant_id_assistants_id_fk" FOREIGN KEY ("assistant_id") REFERENCES "public"."assistants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_publications" ADD CONSTRAINT "assistant_publications_prompt_revision_id_prompt_revisions_id_fk" FOREIGN KEY ("prompt_revision_id") REFERENCES "public"."prompt_revisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_publications" ADD CONSTRAINT "assistant_publications_supersedes_id_assistant_publications_id_fk" FOREIGN KEY ("supersedes_id") REFERENCES "public"."assistant_publications"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_publications" ADD CONSTRAINT "assistant_publications_published_by_users_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistants" ADD CONSTRAINT "assistants_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistants" ADD CONSTRAINT "assistants_active_publication_id_assistant_publications_id_fk" FOREIGN KEY ("active_publication_id") REFERENCES "public"."assistant_publications"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_revisions" ADD CONSTRAINT "prompt_revisions_prompt_id_prompts_id_fk" FOREIGN KEY ("prompt_id") REFERENCES "public"."prompts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_revisions" ADD CONSTRAINT "prompt_revisions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompts" ADD CONSTRAINT "prompts_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assistant_publications_assistant_published_idx" ON "assistant_publications" USING btree ("assistant_id","published_at");--> statement-breakpoint
CREATE INDEX "assistant_publications_prompt_revision_idx" ON "assistant_publications" USING btree ("prompt_revision_id");--> statement-breakpoint
CREATE UNIQUE INDEX "assistants_project_uidx" ON "assistants" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "assistants_public_id_uidx" ON "assistants" USING btree ("public_id");--> statement-breakpoint
CREATE UNIQUE INDEX "prompt_revisions_prompt_revision_uidx" ON "prompt_revisions" USING btree ("prompt_id","revision_no");--> statement-breakpoint
CREATE INDEX "prompt_revisions_prompt_created_idx" ON "prompt_revisions" USING btree ("prompt_id","created_at");--> statement-breakpoint
CREATE INDEX "prompts_project_status_idx" ON "prompts" USING btree ("project_id","status");