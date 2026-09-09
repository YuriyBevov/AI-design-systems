import type {
  CreateProjectRequest,
  ProjectResponse,
  UpdateProjectRequest,
  UpdateProjectStatusRequest,
} from "@ai-assist/contracts";
import { checksumAssistantConfig, createOpaqueToken } from "@ai-assist/domain";
import type { H3Event } from "h3";

import { listProjectAuditEvents, writeAuditEvent } from "../repositories/audit";
import { findAssistantSettingsRecord } from "../repositories/assistant";
import { listPromptRecords, listPromptRevisionRecordsForProject } from "../repositories/prompts";
import {
  createProjectRecord,
  findManageableProjectForUser,
  listManageableProjectsForUser,
  type ProjectAssistantConfig,
  type ProjectRecordWithRole,
  type ProjectTemplatePrompt,
  updateProject,
  updateProjectStatus as updateProjectStatusRecord,
} from "../repositories/projects";
import { findActiveAssignableUsers } from "../repositories/users";
import { getRequestId } from "../utils/request";
import {
  assertCsrf,
  assertRecentAdminAuthentication,
  requireAccountAdmin,
  requireAdminSession,
  requireProjectScope,
} from "./auth";
import { createDefaultAssistantConfig } from "./assistant";

const defaultProjectLocale = "ru";
const defaultConversationRetentionDays = 30;

const toProjectResponse = (project: ProjectRecordWithRole): ProjectResponse => ({
  ...project,
  updatedAt: project.updatedAt.toISOString(),
});

const normalizeSuggestedSlug = (name: string): string => {
  const normalized = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 64)
    .replace(/-+$/gu, "");
  return normalized.length >= 2
    ? normalized
    : `project-${createOpaqueToken()
        .toLowerCase()
        .replace(/[^a-z0-9]/gu, "")
        .slice(0, 10)}`;
};

const hasDatabaseErrorCode = (error: unknown, code: string): boolean => {
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current && typeof current === "object"; depth += 1) {
    if ((current as { code?: unknown }).code === code) return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
};

const assistantConfigFromTemplate = (
  template: Awaited<ReturnType<typeof findAssistantSettingsRecord>>,
  project: Pick<CreateProjectRequest, "name">,
): ProjectAssistantConfig => {
  if (!template) {
    return createDefaultAssistantConfig({ ...project, defaultLocale: defaultProjectLocale });
  }
  return {
    name: template.draft.name,
    greeting: template.draft.greeting,
    placeholder: template.draft.placeholder,
    accentColor: template.draft.accentColor,
    launcherPosition: template.draft.launcherPosition,
    contactFallback: null,
    locale: defaultProjectLocale,
    enabled: template.draft.enabled,
    maintenanceMessage: template.draft.maintenanceMessage,
    maxConversationTurns: template.draft.maxConversationTurns,
    responseTimeoutSeconds: template.draft.responseTimeoutSeconds,
    dailyRateLimit: template.draft.dailyRateLimit,
    citationsEnabled: template.draft.citationsEnabled,
  };
};

const promptsFromTemplate = async (projectId: string): Promise<ProjectTemplatePrompt[]> => {
  const [promptRecords, revisions] = await Promise.all([
    listPromptRecords(projectId),
    listPromptRevisionRecordsForProject(projectId),
  ]);
  const latestByPrompt = new Map<string, (typeof revisions)[number]>();
  for (const revision of revisions) {
    if (!latestByPrompt.has(revision.promptId)) latestByPrompt.set(revision.promptId, revision);
  }

  return promptRecords.flatMap((prompt) => {
    if (prompt.status === "archived") return [];
    const revision = latestByPrompt.get(prompt.id);
    if (!revision) return [];
    return [
      {
        type: prompt.type,
        name: prompt.name,
        description: prompt.description,
        content: revision.content,
        variables: revision.variables,
        contentChecksum: revision.contentChecksum,
      },
    ];
  });
};

const requireManageableOwner = async (
  event: H3Event,
  projectId: string,
  requireRecentAuthentication = false,
): Promise<{
  session: Awaited<ReturnType<typeof requireAdminSession>>;
  project: ProjectRecordWithRole;
}> => {
  const session = await requireAccountAdmin(event);
  assertCsrf(event, session);
  if (requireRecentAuthentication) assertRecentAdminAuthentication(session);
  const project = await findManageableProjectForUser(session.userId, projectId);
  if (!project) throw createError({ statusCode: 404, statusMessage: "Project not found" });
  if (project.role !== "owner") {
    throw createError({ statusCode: 403, statusMessage: "Project owner role required" });
  }
  return { session, project };
};

export const listProjects = async (event: H3Event): Promise<ProjectResponse[]> => {
  const session = await requireAdminSession(event);
  return (await listManageableProjectsForUser(session.userId)).map(toProjectResponse);
};

export const createProject = async (
  event: H3Event,
  input: CreateProjectRequest,
): Promise<ProjectResponse> => {
  const session = await requireAccountAdmin(event);
  assertCsrf(event, session);

  const selectedUsers = await findActiveAssignableUsers(input.userIds);
  if (selectedUsers.length !== input.userIds.length) {
    throw createError({
      statusCode: 400,
      statusMessage: "Один или несколько пользователей недоступны",
      data: { code: "PROJECT_USERS_NOT_FOUND" },
    });
  }

  let templateProject: ProjectRecordWithRole | null = null;
  let templateAssistant: Awaited<ReturnType<typeof findAssistantSettingsRecord>> = null;
  let templatePrompts: ProjectTemplatePrompt[] = [];
  if (input.templateProjectId) {
    templateProject = await findManageableProjectForUser(session.userId, input.templateProjectId);
    if (!templateProject || templateProject.status !== "active") {
      throw createError({ statusCode: 404, statusMessage: "Template project not found" });
    }
    if (templateProject.role !== "owner") {
      throw createError({ statusCode: 403, statusMessage: "Template project owner role required" });
    }
    [templateAssistant, templatePrompts] = await Promise.all([
      findAssistantSettingsRecord(templateProject.id),
      promptsFromTemplate(templateProject.id),
    ]);
  }

  const assistantConfig = assistantConfigFromTemplate(templateAssistant, input);
  const baseSlug = normalizeSuggestedSlug(input.name);
  const conversationRetentionDays =
    templateProject?.conversationRetentionDays ?? defaultConversationRetentionDays;

  let project: ProjectRecordWithRole | null = null;
  for (let attempt = 0; attempt < 4 && !project; attempt += 1) {
    const slug =
      attempt === 0
        ? baseSlug
        : `${baseSlug}-${createOpaqueToken()
            .toLowerCase()
            .replace(/[^a-z0-9]/gu, "")
            .slice(0, 8)}`;
    try {
      project = await createProjectRecord({
        userId: session.userId,
        userIds: input.userIds,
        name: input.name,
        slug,
        timezone: input.timezone,
        defaultLocale: defaultProjectLocale,
        conversationRetentionDays,
        assistantPublicId: `asst_${createOpaqueToken()}`,
        assistantConfig,
        assistantContentChecksum: checksumAssistantConfig({
          ...assistantConfig,
          allowedOrigins: [],
        }),
        prompts: templatePrompts,
      });
    } catch (error) {
      if (!hasDatabaseErrorCode(error, "23505")) throw error;
    }
  }
  if (!project) {
    throw createError({
      statusCode: 409,
      statusMessage: "Project identifier could not be generated",
      data: { code: "PROJECT_SLUG_GENERATION_FAILED" },
    });
  }

  await writeAuditEvent({
    projectId: project.id,
    actorUserId: session.userId,
    action: "project.created",
    resourceType: "project",
    resourceId: project.id,
    requestId: getRequestId(event),
    metadata: {
      templateProjectId: templateProject?.id ?? null,
      copiedAssistantDraft: Boolean(templateProject),
      copiedPromptCount: templatePrompts.length,
      assignedUserCount: input.userIds.length,
      excluded: [
        "origins",
        "contactFallback",
        "providerCredentials",
        "modelSettings",
        "knowledge",
        "publications",
        "conversations",
        "audit",
      ],
    },
  });

  return toProjectResponse(project);
};

export const getProject = async (event: H3Event, projectId: string): Promise<ProjectResponse> => {
  const { project } = await requireProjectScope(event, projectId);
  return toProjectResponse(project);
};

export const patchProject = async (
  event: H3Event,
  projectId: string,
  update: UpdateProjectRequest,
): Promise<ProjectResponse> => {
  const { session, project } = await requireProjectScope(event, projectId, "owner");
  assertCsrf(event, session);
  const updated = await updateProject(project.id, update);

  if (!updated) {
    throw createError({ statusCode: 404, statusMessage: "Project not found" });
  }

  await writeAuditEvent({
    projectId: project.id,
    actorUserId: session.userId,
    action: "project.updated",
    resourceType: "project",
    resourceId: project.id,
    requestId: getRequestId(event),
    metadata: { changedFields: Object.keys(update) },
  });

  return toProjectResponse({ ...updated, role: project.role });
};

export const changeProjectStatus = async (
  event: H3Event,
  projectId: string,
  input: UpdateProjectStatusRequest,
): Promise<ProjectResponse> => {
  const { session, project } = await requireManageableOwner(event, projectId);
  if (project.status === input.status) return toProjectResponse(project);
  const updated = await updateProjectStatusRecord(project.id, input.status);
  if (!updated) throw createError({ statusCode: 404, statusMessage: "Project not found" });

  await writeAuditEvent({
    projectId: project.id,
    actorUserId: session.userId,
    action: input.status === "suspended" ? "project.suspended" : "project.resumed",
    resourceType: "project",
    resourceId: project.id,
    requestId: getRequestId(event),
    metadata: { previousStatus: project.status },
  });

  return toProjectResponse({ ...updated, role: project.role });
};

export const archiveProject = async (
  event: H3Event,
  projectId: string,
): Promise<ProjectResponse> => {
  const { session, project } = await requireManageableOwner(event, projectId, true);
  const updated = await updateProjectStatusRecord(project.id, "archived");
  if (!updated) throw createError({ statusCode: 404, statusMessage: "Project not found" });

  await writeAuditEvent({
    projectId: project.id,
    actorUserId: session.userId,
    action: "project.archived",
    resourceType: "project",
    resourceId: project.id,
    requestId: getRequestId(event),
    metadata: { previousStatus: project.status, deletionMode: "soft" },
  });

  return toProjectResponse({ ...updated, role: project.role });
};

export const getProjectAudit = async (event: H3Event, projectId: string) => {
  await requireProjectScope(event, projectId);
  const events = await listProjectAuditEvents(projectId);

  return events.map((auditEvent) => ({
    ...auditEvent,
    createdAt: auditEvent.createdAt.toISOString(),
  }));
};
