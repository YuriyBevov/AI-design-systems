CREATE TYPE "public"."account_role" AS ENUM('admin', 'user');--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "display_name" varchar(160);--> statement-breakpoint
UPDATE "users"
SET "display_name" = COALESCE(NULLIF(split_part("email_normalized", '@', 1), ''), 'Пользователь');--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "display_name" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "role" "account_role" DEFAULT 'user' NOT NULL;--> statement-breakpoint
UPDATE "users" AS "user_record"
SET "role" = 'admin'
WHERE EXISTS (
  SELECT 1
  FROM "project_memberships"
  WHERE "project_memberships"."user_id" = "user_record"."id"
    AND "project_memberships"."role" = 'owner'
);--> statement-breakpoint
INSERT INTO "project_memberships" ("project_id", "user_id", "role")
SELECT "projects"."id", "users"."id", 'owner'
FROM "projects"
CROSS JOIN "users"
WHERE "projects"."status" <> 'archived'
  AND "users"."role" = 'admin'
  AND "users"."status" = 'active'
ON CONFLICT ("project_id", "user_id") DO UPDATE
SET "role" = 'owner', "updated_at" = now();--> statement-breakpoint
UPDATE "project_memberships" AS "membership"
SET "role" = 'viewer', "updated_at" = now()
FROM "users"
WHERE "membership"."user_id" = "users"."id"
  AND "users"."role" = 'user'
  AND "membership"."role" <> 'viewer';
