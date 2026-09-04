import { and, eq } from "drizzle-orm";

import { projectMemberships, projects } from "@ai-assist/database";
import type { UpdateProjectRequest } from "@ai-assist/contracts";

import { getInfrastructure } from "../utils/infrastructure";

export const findProjectForUser = async (userId: string, projectId: string) => {
  const result = await getInfrastructure().database.db
    .select({
      id: projects.id,
      name: projects.name,
      slug: projects.slug,
      status: projects.status,
      timezone: projects.timezone,
      defaultLocale: projects.defaultLocale,
      primaryOrigin: projects.primaryOrigin,
      conversationRetentionDays: projects.conversationRetentionDays,
      role: projectMemberships.role,
      updatedAt: projects.updatedAt,
    })
    .from(projectMemberships)
    .innerJoin(projects, eq(projects.id, projectMemberships.projectId))
    .where(and(eq(projectMemberships.userId, userId), eq(projects.id, projectId)))
    .limit(1);

  return result[0] ?? null;
};

export const updateProject = async (projectId: string, update: UpdateProjectRequest) => {
  const result = await getInfrastructure().database.db
    .update(projects)
    .set({ ...update, updatedAt: new Date() })
    .where(eq(projects.id, projectId))
    .returning();

  return result[0] ?? null;
};
