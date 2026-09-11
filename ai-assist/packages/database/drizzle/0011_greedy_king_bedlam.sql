ALTER TABLE "sessions" ADD COLUMN "reauthenticated_at" timestamp with time zone;
UPDATE "sessions" SET "reauthenticated_at" = "created_at";
ALTER TABLE "sessions" ALTER COLUMN "reauthenticated_at" SET DEFAULT now();
ALTER TABLE "sessions" ALTER COLUMN "reauthenticated_at" SET NOT NULL;
