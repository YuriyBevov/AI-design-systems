import type { ProjectResponse, UpdateProjectRequest } from "@ai-assist/contracts";
import type { H3Event } from "h3";

import { listProjectAuditEvents, writeAuditEvent } from "../repositories/audit";
import { updateProject } from "../repositories/projects";
import { getRequestId } from "../utils/request";
import { assertCsrf, requireProjectScope } from "./auth";

const toProjectResponse = (project: {
  id: string;
  name: string;
  slug: string;
  status: "active" | "archived";
  timezone: string;
  defaultLocale: string;
  primaryOrigin: string | null;
  conversationRetentionDays: number;
  role: "owner" | "editor" | "viewer";
  updatedAt: Date;
}): ProjectResponse => ({
  ...project,
  updatedAt: project.updatedAt.toISOString(),
});

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

export const getProjectAudit = async (event: H3Event, projectId: string) => {
  await requireProjectScope(event, projectId);
  const events = await listProjectAuditEvents(projectId);

  return events.map((auditEvent) => ({
    ...auditEvent,
    createdAt: auditEvent.createdAt.toISOString(),
  }));
};
