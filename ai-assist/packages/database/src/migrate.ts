import { migrate } from "drizzle-orm/postgres-js/migrator";
import { fileURLToPath } from "node:url";

import { createDatabase } from "./client.js";

const localDatabaseUrl = "postgresql://ai_assist:change-me-local-only@localhost:55432/ai_assist";
const databaseUrl =
  process.env.DATABASE_URL ??
  (process.env.NODE_ENV === "production" ? undefined : localDatabaseUrl);

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to run migrations");
}

const connection = createDatabase(databaseUrl);

try {
  await migrate(connection.db, {
    migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)),
  });
} finally {
  await connection.client.end();
}
