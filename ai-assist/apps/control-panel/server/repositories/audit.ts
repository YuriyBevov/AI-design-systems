import { desc, eq } from "drizzle-orm";

import { auditEvents, users } from "@ai-assist/database";
import { redactAuditMetadata } from "@ai-assist/domain";

import { getInfrastructure } from "../utils/infrastructure";

export const writeAuditEvent = async (input: {
  projectId?: string;
  actorUserId?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  requestId: string;
  metadata?: unknown;
}): Promise<void> => {
  const metadata = redactAuditMetadata(input.metadata ?? {});
  if (Array.isArray(metadata) || metadata === null || typeof metadata !== "object") {
    throw new Error("Audit metadata must be an object");
  }

  await getInfrastructure().database.db.insert(auditEvents).values({
    projectId: input.projectId,
    actorUserId: input.actorUserId,
    action: input.action,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    requestId: input.requestId,
    metadata,
  });
};

export const listProjectAuditEvents = async (projectId: string, limit = 100) =>
  getInfrastructure().database.db
    .select({
      id: auditEvents.id,
      action: auditEvents.action,
      resourceType: auditEvents.resourceType,
      resourceId: auditEvents.resourceId,
      requestId: auditEvents.requestId,
      actorEmail: users.emailNormalized,
      metadata: auditEvents.metadata,
      createdAt: auditEvents.createdAt,
    })
    .from(auditEvents)
    .leftJoin(users, eq(users.id, auditEvents.actorUserId))
    .where(eq(auditEvents.projectId, projectId))
    .orderBy(desc(auditEvents.createdAt))
    .limit(Math.min(Math.max(limit, 1), 100));
