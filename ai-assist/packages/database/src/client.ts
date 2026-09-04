import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema.js";

export const createDatabase = (databaseUrl: string) => {
  const client = postgres(databaseUrl, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
  });

  return {
    client,
    db: drizzle(client, { schema }),
  };
};

export type DatabaseConnection = ReturnType<typeof createDatabase>;

export const pingDatabase = async (connection: DatabaseConnection): Promise<void> => {
  await connection.client`select 1`;
};
