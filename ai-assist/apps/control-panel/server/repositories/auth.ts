import { and, eq, gt, isNull } from "drizzle-orm";

import { projectMemberships, projects, sessions, users } from "@ai-assist/database";

import { getInfrastructure } from "../utils/infrastructure";

export type AuthUserRecord = {
  id: string;
  name: string;
  email: string;
  passwordHash: string | null;
  role: "admin" | "user";
  status: "invited" | "active" | "disabled";
};

export type AuthSessionRecord = {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: "admin" | "user";
  csrfTokenHash: string;
  expiresAt: Date;
  createdAt: Date;
};

export const findUserByEmail = async (email: string): Promise<AuthUserRecord | null> => {
  const result = await getInfrastructure()
    .database.db.select({
      id: users.id,
      name: users.displayName,
      email: users.emailNormalized,
      passwordHash: users.passwordHash,
      role: users.role,
      status: users.status,
    })
    .from(users)
    .where(eq(users.emailNormalized, email))
    .limit(1);

  return result[0] ?? null;
};

export const createAdminSession = async (input: {
  userId: string;
  tokenHash: string;
  csrfTokenHash: string;
  expiresAt: Date;
}): Promise<void> => {
  await getInfrastructure().database.db.insert(sessions).values(input);
};

export const findActiveSession = async (tokenHash: string): Promise<AuthSessionRecord | null> => {
  const result = await getInfrastructure()
    .database.db.select({
      id: sessions.id,
      userId: sessions.userId,
      name: users.displayName,
      email: users.emailNormalized,
      role: users.role,
      csrfTokenHash: sessions.csrfTokenHash,
      expiresAt: sessions.expiresAt,
      createdAt: sessions.createdAt,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(
      and(
        eq(sessions.tokenHash, tokenHash),
        isNull(sessions.revokedAt),
        gt(sessions.expiresAt, new Date()),
        eq(users.status, "active"),
      ),
    )
    .limit(1);

  return result[0] ?? null;
};

export const listSessionProjects = async (userId: string) =>
  getInfrastructure()
    .database.db.select({
      id: projects.id,
      name: projects.name,
      slug: projects.slug,
      role: projectMemberships.role,
    })
    .from(projectMemberships)
    .innerJoin(projects, eq(projects.id, projectMemberships.projectId))
    .where(and(eq(projectMemberships.userId, userId), eq(projects.status, "active")))
    .orderBy(projects.name);

export const markLoginSuccessful = async (userId: string): Promise<void> => {
  await getInfrastructure()
    .database.db.update(users)
    .set({ lastLoginAt: new Date(), updatedAt: new Date() })
    .where(eq(users.id, userId));
};

export const touchSession = async (sessionId: string): Promise<void> => {
  await getInfrastructure()
    .database.db.update(sessions)
    .set({ lastSeenAt: new Date() })
    .where(eq(sessions.id, sessionId));
};

export const revokeSession = async (sessionId: string): Promise<void> => {
  await getInfrastructure()
    .database.db.update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.id, sessionId), isNull(sessions.revokedAt)));
};
