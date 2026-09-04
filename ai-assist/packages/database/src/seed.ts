import { eq } from "drizzle-orm";
import { hashPassword } from "@ai-assist/domain";

import { createDatabase } from "./client.js";
import { projectMemberships, projects, users } from "./schema.js";

const localDatabaseUrl = "postgresql://ai_assist:change-me-local-only@localhost:55432/ai_assist";
const databaseUrl =
  process.env.DATABASE_URL ??
  (process.env.NODE_ENV === "production" ? undefined : localDatabaseUrl);

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to seed the database");
}

if (process.env.NODE_ENV === "production") {
  throw new Error("Development seed is disabled in production");
}

const developmentPassword = process.env.AI_ASSIST_DEV_OWNER_PASSWORD ?? "LocalDev-ChangeMe-2026!";
const developmentPasswordHash = await hashPassword(developmentPassword);

const connection = createDatabase(databaseUrl);

try {
  const [project] = await connection.db
    .insert(projects)
    .values({
      name: "Гофропродпак",
      slug: "gofroprodpak",
      primaryOrigin: "https://gofroprodpak.ru",
    })
    .onConflictDoUpdate({
      target: projects.slug,
      set: {
        name: "Гофропродпак",
        primaryOrigin: "https://gofroprodpak.ru",
        updatedAt: new Date(),
      },
    })
    .returning({ id: projects.id });

  const [owner] = await connection.db
    .insert(users)
    .values({
      emailNormalized: "owner@gofroprodpak.local",
      passwordHash: developmentPasswordHash,
      status: "active",
    })
    .onConflictDoUpdate({
      target: users.emailNormalized,
      set: {
        passwordHash: developmentPasswordHash,
        status: "active",
        updatedAt: new Date(),
      },
    })
    .returning({ id: users.id });

  const existingOwner =
    owner ??
    (await connection.db.query.users.findFirst({
      columns: { id: true },
      where: eq(users.emailNormalized, "owner@gofroprodpak.local"),
    }));

  if (!project || !existingOwner) {
    throw new Error("Unable to create the development project and owner");
  }

  await connection.db
    .insert(projectMemberships)
    .values({
      projectId: project.id,
      userId: existingOwner.id,
      role: "owner",
    })
    .onConflictDoNothing();
} finally {
  await connection.client.end();
}
