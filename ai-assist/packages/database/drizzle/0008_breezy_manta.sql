CREATE TYPE "public"."widget_conversation_status" AS ENUM('active', 'closed');--> statement-breakpoint
CREATE TYPE "public"."widget_generation_status" AS ENUM('running', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."widget_message_role" AS ENUM('user', 'assistant');--> statement-breakpoint
CREATE TYPE "public"."widget_message_status" AS ENUM('pending', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE "widget_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"public_id" varchar(80) NOT NULL,
	"widget_session_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"assistant_id" uuid NOT NULL,
	"status" "widget_conversation_status" DEFAULT 'active' NOT NULL,
	"locale" varchar(16) NOT NULL,
	"qualification_state" jsonb NOT NULL,
	"summary" text,
	"last_activity_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "widget_generation_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"widget_session_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"user_message_id" uuid,
	"assistant_message_id" uuid,
	"publication_id" uuid NOT NULL,
	"idempotency_key_hash" varchar(64) NOT NULL,
	"status" "widget_generation_status" DEFAULT 'running' NOT NULL,
	"model_id" varchar(255) NOT NULL,
	"resolved_model_id" varchar(255),
	"input_tokens" integer,
	"output_tokens" integer,
	"first_token_latency_ms" integer,
	"total_latency_ms" integer,
	"finish_reason" varchar(100),
	"error_code" varchar(100),
	"request_id" varchar(128) NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "widget_generation_sources" (
	"generation_run_id" uuid NOT NULL,
	"knowledge_chunk_id" uuid NOT NULL,
	"rank" integer NOT NULL,
	"score" double precision NOT NULL,
	"cited" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "widget_generation_sources_generation_run_id_knowledge_chunk_id_pk" PRIMARY KEY("generation_run_id","knowledge_chunk_id")
);
--> statement-breakpoint
CREATE TABLE "widget_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"role" "widget_message_role" NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"status" "widget_message_status" DEFAULT 'completed' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "widget_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"assistant_id" uuid NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"origin_hash" varchar(64) NOT NULL,
	"locale" varchar(16) NOT NULL,
	"widget_version" varchar(40) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "widget_conversations" ADD CONSTRAINT "widget_conversations_widget_session_id_widget_sessions_id_fk" FOREIGN KEY ("widget_session_id") REFERENCES "public"."widget_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "widget_conversations" ADD CONSTRAINT "widget_conversations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "widget_conversations" ADD CONSTRAINT "widget_conversations_assistant_id_assistants_id_fk" FOREIGN KEY ("assistant_id") REFERENCES "public"."assistants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "widget_generation_runs" ADD CONSTRAINT "widget_generation_runs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "widget_generation_runs" ADD CONSTRAINT "widget_generation_runs_widget_session_id_widget_sessions_id_fk" FOREIGN KEY ("widget_session_id") REFERENCES "public"."widget_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "widget_generation_runs" ADD CONSTRAINT "widget_generation_runs_conversation_id_widget_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."widget_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "widget_generation_runs" ADD CONSTRAINT "widget_generation_runs_user_message_id_widget_messages_id_fk" FOREIGN KEY ("user_message_id") REFERENCES "public"."widget_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "widget_generation_runs" ADD CONSTRAINT "widget_generation_runs_assistant_message_id_widget_messages_id_fk" FOREIGN KEY ("assistant_message_id") REFERENCES "public"."widget_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "widget_generation_runs" ADD CONSTRAINT "widget_generation_runs_publication_id_assistant_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."assistant_publications"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "widget_generation_sources" ADD CONSTRAINT "widget_generation_sources_generation_run_id_widget_generation_runs_id_fk" FOREIGN KEY ("generation_run_id") REFERENCES "public"."widget_generation_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "widget_generation_sources" ADD CONSTRAINT "widget_generation_sources_knowledge_chunk_id_knowledge_chunks_id_fk" FOREIGN KEY ("knowledge_chunk_id") REFERENCES "public"."knowledge_chunks"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "widget_messages" ADD CONSTRAINT "widget_messages_conversation_id_widget_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."widget_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "widget_sessions" ADD CONSTRAINT "widget_sessions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "widget_sessions" ADD CONSTRAINT "widget_sessions_assistant_id_assistants_id_fk" FOREIGN KEY ("assistant_id") REFERENCES "public"."assistants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "widget_conversations_public_id_uidx" ON "widget_conversations" USING btree ("public_id");--> statement-breakpoint
CREATE UNIQUE INDEX "widget_conversations_session_active_uidx" ON "widget_conversations" USING btree ("widget_session_id") WHERE "widget_conversations"."status" = 'active';--> statement-breakpoint
CREATE INDEX "widget_conversations_project_activity_idx" ON "widget_conversations" USING btree ("project_id","last_activity_at");--> statement-breakpoint
CREATE INDEX "widget_conversations_session_activity_idx" ON "widget_conversations" USING btree ("widget_session_id","last_activity_at");--> statement-breakpoint
CREATE UNIQUE INDEX "widget_generation_runs_session_idempotency_uidx" ON "widget_generation_runs" USING btree ("widget_session_id","idempotency_key_hash");--> statement-breakpoint
CREATE INDEX "widget_generation_runs_project_created_idx" ON "widget_generation_runs" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE INDEX "widget_generation_runs_conversation_created_idx" ON "widget_generation_runs" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "widget_generation_sources_chunk_idx" ON "widget_generation_sources" USING btree ("knowledge_chunk_id");--> statement-breakpoint
CREATE INDEX "widget_messages_conversation_created_idx" ON "widget_messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "widget_sessions_token_hash_uidx" ON "widget_sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "widget_sessions_project_expires_idx" ON "widget_sessions" USING btree ("project_id","expires_at");--> statement-breakpoint
CREATE INDEX "widget_sessions_assistant_expires_idx" ON "widget_sessions" USING btree ("assistant_id","expires_at");