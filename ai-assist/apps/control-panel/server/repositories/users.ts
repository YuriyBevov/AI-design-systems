import { and, asc, eq, inArray, isNull, ne } from "drizzle-orm";

import { projectMemberships, projects, sessions, users } from "@ai-assist/database";
import type { DatabaseConnection } from "@ai-assist/database";
import type { AccountRole, UserStatus } from "@ai-assist/contracts";

import { getInfrastructure } from "../utils/infrastructure";

type DatabaseTransaction = Parameters<Parameters<DatabaseConnection["db"]["transaction"]>[0]>[0];

export type UserRecord = {
  id: string;
  name: string;
  email: string;
  passwordHash: string | null;
  role: AccountRole;
  status: UserStatus;
  projectIds: string[];
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

const listMembershipProjectIds = async (): Promise<Map<string, string[]>> => {
  const memberships = await getInfrastructure()
    .database.db.select({
      userId: projectMemberships.userId,
      projectId: projectMemberships.projectId,
    })
    .from(projectMemberships)
    .innerJoin(projects, eq(projects.id, projectMemberships.projectId))
    .where(ne(projects.status, "archived"))
    .orderBy(asc(projects.name));

  const byUser = new Map<string, string[]>();
  for (const membership of memberships) {
    const projectIds = byUser.get(membership.userId) ?? [];
    projectIds.push(membership.projectId);
    byUser.set(membership.userId, projectIds);
  }
  return byUser;
};

export const listUserRecords = async (): Promise<UserRecord[]> => {
  const [records, projectIdsByUser] = await Promise.all([
    getInfrastructure()
      .database.db.select({
        id: users.id,
        name: users.displayName,
        email: users.emailNormalized,
        passwordHash: users.passwordHash,
        role: users.role,
        status: users.status,
        lastLoginAt: users.lastLoginAt,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      })
      .from(users)
      .orderBy(asc(users.displayName), asc(users.emailNormalized)),
    listMembershipProjectIds(),
  ]);

  return records.map((record) => ({
    ...record,
    projectIds: projectIdsByUser.get(record.id) ?? [],
  }));
};

export const findUserRecord = async (userId: string): Promise<UserRecord | null> =>
  (await listUserRecords()).find((user) => user.id === userId) ?? null;

const listProjectIdsForRole = async (
  role: AccountRole,
  requestedProjectIds: string[],
): Promise<string[]> => {
  const requested = role === "admin" ? undefined : [...new Set(requestedProjectIds)];
  if (requested?.length === 0) return [];

  const rows = await getInfrastructure()
    .database.db.select({ id: projects.id })
    .from(projects)
    .where(
      requested
        ? and(ne(projects.status, "archived"), inArray(projects.id, requested))
        : ne(projects.status, "archived"),
    );
  if (requested && rows.length !== requested.length) {
    throw new Error("USER_PROJECTS_NOT_FOUND");
  }
  return rows.map(({ id }) => id);
};

const replaceUserMemberships = async (
  transaction: DatabaseTransaction,
  userId: string,
  role: AccountRole,
  projectIds: string[],
): Promise<void> => {
  await transaction.delete(projectMemberships).where(eq(projectMemberships.userId, userId));
  if (projectIds.length === 0) return;
  await transaction.insert(projectMemberships).values(
    projectIds.map((projectId) => ({
      projectId,
      userId,
      role: role === "admin" ? ("owner" as const) : ("viewer" as const),
    })),
  );
};

export const createUserRecord = async (input: {
  name: string;
  email: string;
  passwordHash: string;
  role: AccountRole;
  projectIds: string[];
}): Promise<UserRecord> => {
  const projectIds = await listProjectIdsForRole(input.role, input.projectIds);
  const userId = await getInfrastructure().database.db.transaction(async (transaction) => {
    const [user] = await transaction
      .insert(users)
      .values({
        displayName: input.name,
        emailNormalized: input.email,
        passwordHash: input.passwordHash,
        role: input.role,
        status: "active",
      })
      .returning({ id: users.id });
    if (!user) throw new Error("User insert failed");
    await replaceUserMemberships(transaction, user.id, input.role, projectIds);
    return user.id;
  });
  const created = await findUserRecord(userId);
  if (!created) throw new Error("Created user could not be loaded");
  return created;
};

export const updateUserRecord = async (input: {
  userId: string;
  name: string;
  email: string;
  passwordHash: string | null;
  role: AccountRole;
  status: UserStatus;
  projectIds: string[];
  protectLastAdministrator: boolean;
}): Promise<UserRecord | null> => {
  const projectIds = await listProjectIdsForRole(input.role, input.projectIds);
  const updated = await getInfrastructure().database.db.transaction(async (transaction) => {
    if (input.protectLastAdministrator) {
      const activeAdministrators = await transaction
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.role, "admin"), eq(users.status, "active")))
        .for("update");
      if (activeAdministrators.length <= 1) throw new Error("LAST_ACTIVE_ADMIN");
    }

    const [user] = await transaction
      .update(users)
      .set({
        displayName: input.name,
        emailNormalized: input.email,
        ...(input.passwordHash ? { passwordHash: input.passwordHash } : {}),
        role: input.role,
        status: input.status,
        updatedAt: new Date(),
      })
      .where(eq(users.id, input.userId))
      .returning({ id: users.id });
    if (!user) return null;

    await replaceUserMemberships(transaction, user.id, input.role, projectIds);
    if (input.status === "disabled") {
      await transaction
        .update(sessions)
        .set({ revokedAt: new Date() })
        .where(and(eq(sessions.userId, user.id), isNull(sessions.revokedAt)));
    }
    return user;
  });
  return updated ? findUserRecord(updated.id) : null;
};

export const findActiveAssignableUsers = async (userIds: string[]) => {
  const uniqueIds = [...new Set(userIds)];
  if (uniqueIds.length === 0) return [];
  return getInfrastructure()
    .database.db.select({ id: users.id })
    .from(users)
    .where(and(inArray(users.id, uniqueIds), eq(users.role, "user"), eq(users.status, "active")));
};
