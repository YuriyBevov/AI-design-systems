CREATE TABLE "assistant_allowed_origins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"config_revision_id" uuid NOT NULL,
	"origin" varchar(512) NOT NULL,
	"scheme" varchar(8) NOT NULL,
	"host" varchar(255) NOT NULL,
	"port" integer,
	"environment" varchar(16) NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assistant_config_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assistant_id" uuid NOT NULL,
	"revision_no" integer NOT NULL,
	"name" varchar(160) NOT NULL,
	"greeting" text NOT NULL,
	"placeholder" varchar(200) NOT NULL,
	"accent_color" varchar(7) NOT NULL,
	"launcher_position" varchar(16) NOT NULL,
	"contact_fallback" text,
	"locale" varchar(16) NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"maintenance_message" text,
	"max_conversation_turns" integer NOT NULL,
	"response_timeout_seconds" integer NOT NULL,
	"daily_rate_limit" integer NOT NULL,
	"citations_enabled" boolean DEFAULT true NOT NULL,
	"content_checksum" varchar(64) NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assistant_publications" ADD COLUMN "config_revision_id" uuid;--> statement-breakpoint
ALTER TABLE "assistants" ADD COLUMN "config_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "assistant_allowed_origins" ADD CONSTRAINT "assistant_allowed_origins_config_revision_id_assistant_config_revisions_id_fk" FOREIGN KEY ("config_revision_id") REFERENCES "public"."assistant_config_revisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_config_revisions" ADD CONSTRAINT "assistant_config_revisions_assistant_id_assistants_id_fk" FOREIGN KEY ("assistant_id") REFERENCES "public"."assistants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_config_revisions" ADD CONSTRAINT "assistant_config_revisions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "assistant_allowed_origins_revision_origin_uidx" ON "assistant_allowed_origins" USING btree ("config_revision_id","origin");--> statement-breakpoint
CREATE INDEX "assistant_allowed_origins_revision_idx" ON "assistant_allowed_origins" USING btree ("config_revision_id");--> statement-breakpoint
CREATE UNIQUE INDEX "assistant_config_revisions_assistant_revision_uidx" ON "assistant_config_revisions" USING btree ("assistant_id","revision_no");--> statement-breakpoint
CREATE INDEX "assistant_config_revisions_assistant_created_idx" ON "assistant_config_revisions" USING btree ("assistant_id","created_at");--> statement-breakpoint
INSERT INTO "assistant_config_revisions" (
	"assistant_id",
	"revision_no",
	"name",
	"greeting",
	"placeholder",
	"accent_color",
	"launcher_position",
	"contact_fallback",
	"locale",
	"enabled",
	"maintenance_message",
	"max_conversation_turns",
	"response_timeout_seconds",
	"daily_rate_limit",
	"citations_enabled",
	"content_checksum"
)
SELECT
	"assistants"."id",
	1,
	'Помощник',
	'Здравствуйте! Чем помочь?',
	'Введите вопрос',
	'#315EFB',
	'right',
	NULL,
	"projects"."default_locale",
	true,
	NULL,
	20,
	45,
	500,
	true,
	md5("assistants"."id"::text || ':assistant-config-v1') || md5("assistants"."id"::text || ':assistant-config-v1:2')
FROM "assistants"
INNER JOIN "projects" ON "projects"."id" = "assistants"."project_id";--> statement-breakpoint
INSERT INTO "assistant_allowed_origins" (
	"config_revision_id",
	"origin",
	"scheme",
	"host",
	"port",
	"environment"
)
SELECT
	"assistant_config_revisions"."id",
	lower(regexp_replace("projects"."primary_origin", '/+$', '')),
	lower(split_part("projects"."primary_origin", ':', 1)),
	lower(regexp_replace(split_part("projects"."primary_origin", '/', 3), ':[0-9]+$', '')),
	NULLIF(substring(split_part("projects"."primary_origin", '/', 3) from ':([0-9]+)$'), '')::integer,
	'production'
FROM "assistant_config_revisions"
INNER JOIN "assistants" ON "assistants"."id" = "assistant_config_revisions"."assistant_id"
INNER JOIN "projects" ON "projects"."id" = "assistants"."project_id"
WHERE "assistant_config_revisions"."revision_no" = 1
	AND "projects"."primary_origin" IS NOT NULL;--> statement-breakpoint
UPDATE "assistants" SET "config_version" = 1
WHERE EXISTS (
	SELECT 1
	FROM "assistant_config_revisions"
	WHERE "assistant_config_revisions"."assistant_id" = "assistants"."id"
		AND "assistant_config_revisions"."revision_no" = 1
);--> statement-breakpoint
UPDATE "assistant_publications"
SET "config_revision_id" = "assistant_config_revisions"."id"
FROM "assistant_config_revisions"
WHERE "assistant_config_revisions"."assistant_id" = "assistant_publications"."assistant_id"
	AND "assistant_config_revisions"."revision_no" = 1;--> statement-breakpoint
ALTER TABLE "assistant_publications" ALTER COLUMN "config_revision_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "assistant_publications" ADD CONSTRAINT "assistant_publications_config_revision_id_assistant_config_revisions_id_fk" FOREIGN KEY ("config_revision_id") REFERENCES "public"."assistant_config_revisions"("id") ON DELETE restrict ON UPDATE no action;
