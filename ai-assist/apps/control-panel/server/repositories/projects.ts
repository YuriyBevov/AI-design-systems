import { and, asc, eq, ne } from "drizzle-orm";

import {
  assistantConfigRevisions,
  assistants,
  projectMemberships,
  projects,
  promptRevisions,
  prompts,
  users,
} from "@ai-assist/database";
import type {
  AssistantConfigSnapshot,
  ProjectStatus,
  PromptType,
  UpdateProjectRequest,
} from "@ai-assist/contracts";

import { getInfrastructure } from "../utils/infrastructure";

export type ProjectRecordWithRole = {
  id: string;
  name: string;
  slug: string;
  status: ProjectStatus;
  timezone: string;
  defaultLocale: string;
  primaryOrigin: string | null;
  conversationRetentionDays: number;
  role: "owner" | "editor" | "viewer";
  updatedAt: Date;
};

export type ProjectTemplatePrompt = {
  type: PromptType;
  name: string;
  description: string | null;
  content: string;
  variables: string[];
  contentChecksum: string;
};

export type ProjectAssistantConfig = Omit<AssistantConfigSnapshot, "allowedOrigins">;

const projectSelection = {
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
};

export const findProjectForUser = async (
  userId: string,
  projectId: string,
): Promise<ProjectRecordWithRole | null> => {
  const result = await getInfrastructure()
    .database.db.select(projectSelection)
    .from(projectMemberships)
    .innerJoin(projects, eq(projects.id, projectMemberships.projectId))
    .where(
      and(
        eq(projectMemberships.userId, userId),
        eq(projects.id, projectId),
        eq(projects.status, "active"),
      ),
    )
    .limit(1);

  return result[0] ?? null;
};

export const findManageableProjectForUser = async (
  userId: string,
  projectId: string,
): Promise<ProjectRecordWithRole | null> => {
  const result = await getInfrastructure()
    .database.db.select(projectSelection)
    .from(projectMemberships)
    .innerJoin(projects, eq(projects.id, projectMemberships.projectId))
    .where(
      and(
        eq(projectMemberships.userId, userId),
        eq(projects.id, projectId),
        ne(projects.status, "archived"),
      ),
    )
    .limit(1);

  return result[0] ?? null;
};

export const listManageableProjectsForUser = async (
  userId: string,
): Promise<ProjectRecordWithRole[]> =>
  getInfrastructure()
    .database.db.select(projectSelection)
    .from(projectMemberships)
    .innerJoin(projects, eq(projects.id, projectMemberships.projectId))
    .where(and(eq(projectMemberships.userId, userId), ne(projects.status, "archived")))
    .orderBy(asc(projects.name));

export const createProjectRecord = async (input: {
  userId: string;
  userIds: string[];
  name: string;
  slug: string;
  timezone: string;
  defaultLocale: string;
  conversationRetentionDays: number;
  assistantPublicId: string;
  assistantConfig: ProjectAssistantConfig;
  assistantContentChecksum: string;
  prompts: ProjectTemplatePrompt[];
}): Promise<ProjectRecordWithRole> =>
  getInfrastructure().database.db.transaction(async (transaction) => {
    const [project] = await transaction
      .insert(projects)
      .values({
        name: input.name,
        slug: input.slug,
        timezone: input.timezone,
        defaultLocale: input.defaultLocale,
        conversationRetentionDays: input.conversationRetentionDays,
        primaryOrigin: null,
      })
      .returning();
    if (!project) throw new Error("Project insert failed");

    const administrators = await transaction
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.role, "admin"), eq(users.status, "active")));
    const membershipRoles = new Map<string, "owner" | "viewer">(
      input.userIds.map((userId) => [userId, "viewer"]),
    );
    for (const administrator of administrators) membershipRoles.set(administrator.id, "owner");
    membershipRoles.set(input.userId, "owner");
    await transaction
      .insert(projectMemberships)
      .values(
        [...membershipRoles].map(([userId, role]) => ({ projectId: project.id, userId, role })),
      );

    const [assistant] = await transaction
      .insert(assistants)
      .values({
        projectId: project.id,
        publicId: input.assistantPublicId,
        status: "draft",
        configVersion: 1,
      })
      .returning({ id: assistants.id });
    if (!assistant) throw new Error("Assistant insert failed");

    await transaction.insert(assistantConfigRevisions).values({
      assistantId: assistant.id,
      revisionNo: 1,
      ...input.assistantConfig,
      accentColor: input.assistantConfig.accentColor.toUpperCase(),
      contentChecksum: input.assistantContentChecksum,
      createdBy: input.userId,
    });

    for (const templatePrompt of input.prompts) {
      const [prompt] = await transaction
        .insert(prompts)
        .values({
          projectId: project.id,
          type: templatePrompt.type,
          name: templatePrompt.name,
          description: templatePrompt.description,
          status: "draft",
          version: 1,
        })
        .returning({ id: prompts.id });
      if (!prompt) throw new Error("Prompt insert failed");

      await transaction.insert(promptRevisions).values({
        promptId: prompt.id,
        revisionNo: 1,
        content: templatePrompt.content,
        variables: templatePrompt.variables,
        contentChecksum: templatePrompt.contentChecksum,
        createdBy: input.userId,
      });
    }

    return {
      id: project.id,
      name: project.name,
      slug: project.slug,
      status: project.status,
      timezone: project.timezone,
      defaultLocale: project.defaultLocale,
      primaryOrigin: project.primaryOrigin,
      conversationRetentionDays: project.conversationRetentionDays,
      role: "owner",
      updatedAt: project.updatedAt,
    };
  });

export const updateProject = async (projectId: string, update: UpdateProjectRequest) => {
  const result = await getInfrastructure()
    .database.db.update(projects)
    .set({ ...update, updatedAt: new Date() })
    .where(and(eq(projects.id, projectId), eq(projects.status, "active")))
    .returning();

  return result[0] ?? null;
};

export const updateProjectStatus = async (
  projectId: string,
  status: ProjectStatus,
): Promise<typeof projects.$inferSelect | null> => {
  const [project] = await getInfrastructure()
    .database.db.update(projects)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(projects.id, projectId), ne(projects.status, "archived")))
    .returning();
  return project ?? null;
};
