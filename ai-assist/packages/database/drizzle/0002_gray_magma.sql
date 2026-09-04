CREATE TYPE "public"."model_capability" AS ENUM('chat', 'embeddings', 'rerank');--> statement-breakpoint
CREATE TYPE "public"."provider_credential_status" AS ENUM('verified', 'invalid', 'disabled');--> statement-breakpoint
CREATE TABLE "project_model_settings" (
	"project_id" uuid PRIMARY KEY NOT NULL,
	"chat_model_id" varchar(255),
	"embedding_model_id" varchar(255),
	"rerank_model_id" varchar(255),
	"embedding_dimension" integer,
	"max_output_tokens" integer DEFAULT 1500 NOT NULL,
	"temperature" double precision,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"provider" varchar(50) DEFAULT 'aitunnel' NOT NULL,
	"ciphertext" text NOT NULL,
	"nonce" varchar(64) NOT NULL,
	"auth_tag" varchar(64) NOT NULL,
	"key_version" integer NOT NULL,
	"masked_hint" varchar(64) NOT NULL,
	"status" "provider_credential_status" DEFAULT 'verified' NOT NULL,
	"last_verified_at" timestamp with time zone,
	"last_error_code" varchar(100),
	"verification_metadata" jsonb DEFAULT 'null'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_model_catalog" (
	"provider" varchar(50) DEFAULT 'aitunnel' NOT NULL,
	"model_id" varchar(255) NOT NULL,
	"capability" "model_capability" NOT NULL,
	"upstream_provider" varchar(100),
	"description" text,
	"input_modalities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"output_modalities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"context_size" integer,
	"max_output" integer,
	"max_tokens" integer,
	"pricing" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"available" boolean DEFAULT true NOT NULL,
	"provider_created_at" timestamp with time zone,
	"fetched_at" timestamp with time zone NOT NULL,
	"raw_checksum" varchar(64) NOT NULL,
	CONSTRAINT "provider_model_catalog_provider_model_id_capability_pk" PRIMARY KEY("provider","model_id","capability")
);
--> statement-breakpoint
ALTER TABLE "project_model_settings" ADD CONSTRAINT "project_model_settings_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_model_settings" ADD CONSTRAINT "project_model_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_credentials" ADD CONSTRAINT "provider_credentials_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "provider_credentials_project_provider_uidx" ON "provider_credentials" USING btree ("project_id","provider");--> statement-breakpoint
CREATE INDEX "provider_credentials_status_idx" ON "provider_credentials" USING btree ("status");--> statement-breakpoint
CREATE INDEX "provider_model_catalog_capability_available_idx" ON "provider_model_catalog" USING btree ("provider","capability","available");