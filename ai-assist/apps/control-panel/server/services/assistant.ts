import type {
  AssistantConfigSnapshot,
  AssistantSettingsResponse,
  PublishAssistantRequest,
  UpdateAssistantDraftRequest,
} from "@ai-assist/contracts";
import {
  checksumAssistantConfig,
  createOpaqueToken,
  normalizeAssistantOrigins,
  type NormalizedAssistantOrigin,
} from "@ai-assist/domain";
import type { H3Event } from "h3";

import { writeAuditEvent } from "../repositories/audit";
import {
  createAssistantConfigRevisionRecord,
  ensureAssistantDraftRecord,
  findAssistantSettingsRecord,
  publishAssistantConfigRecord,
  type AssistantConfigRecord,
  type AssistantConfigValues,
  type AssistantSettingsRecord,
} from "../repositories/assistant";
import { getRequestId } from "../utils/request";
import { assertCsrf, requireProjectScope } from "./auth";

export const createDefaultAssistantConfig = (project: {
  name: string;
  defaultLocale: string;
}): AssistantConfigValues => ({
  name: "Помощник",
  greeting: "Здравствуйте! Чем помочь?",
  placeholder: "Введите вопрос",
  accentColor: "#315EFB",
  launcherPosition: "right",
  contactFallback: null,
  locale: project.defaultLocale,
  enabled: true,
  maintenanceMessage: null,
  maxConversationTurns: 20,
  responseTimeoutSeconds: 45,
  dailyRateLimit: 500,
  citationsEnabled: true,
});

const configChecksum = (
  config: AssistantConfigValues,
  origins: NormalizedAssistantOrigin[],
): string => checksumAssistantConfig({ ...config, allowedOrigins: origins });

export const ensureAssistantSettingsRecord = async (input: {
  project: { id: string; name: string; defaultLocale: string; primaryOrigin: string | null };
  userId: string;
}): Promise<AssistantSettingsRecord> => {
  const config = createDefaultAssistantConfig(input.project);
  const originResult = normalizeAssistantOrigins(
    input.project.primaryOrigin
      ? [{ origin: input.project.primaryOrigin, environment: "production" }]
      : [],
  );
  if (!originResult.success) throw new Error("Stored project Origin is invalid");
  await ensureAssistantDraftRecord({
    projectId: input.project.id,
    publicId: `asst_${createOpaqueToken()}`,
    createdBy: input.userId,
    config,
    origins: originResult.origins,
    contentChecksum: configChecksum(config, originResult.origins),
  });
  const settings = await findAssistantSettingsRecord(input.project.id);
  if (!settings) throw new Error("Assistant settings initialization failed");
  return settings;
};

const toConfigSnapshot = (config: AssistantConfigRecord): AssistantConfigSnapshot => ({
  name: config.name,
  greeting: config.greeting,
  placeholder: config.placeholder,
  accentColor: config.accentColor,
  launcherPosition: config.launcherPosition,
  contactFallback: config.contactFallback,
  locale: config.locale,
  enabled: config.enabled,
  maintenanceMessage: config.maintenanceMessage,
  maxConversationTurns: config.maxConversationTurns,
  responseTimeoutSeconds: config.responseTimeoutSeconds,
  dailyRateLimit: config.dailyRateLimit,
  citationsEnabled: config.citationsEnabled,
  allowedOrigins: config.allowedOrigins,
});

const toResponse = (settings: AssistantSettingsRecord): AssistantSettingsResponse => ({
  assistant: {
    id: settings.assistant.id,
    projectId: settings.assistant.projectId,
    publicId: settings.assistant.publicId,
    status: settings.assistant.status,
    configVersion: settings.assistant.configVersion,
    createdAt: settings.assistant.createdAt.toISOString(),
    updatedAt: settings.assistant.updatedAt.toISOString(),
  },
  draft: {
    id: settings.draft.id,
    assistantId: settings.draft.assistantId,
    revisionNo: settings.draft.revisionNo,
    ...toConfigSnapshot(settings.draft),
    contentChecksum: settings.draft.contentChecksum,
    createdByEmail: settings.draft.createdByEmail,
    createdAt: settings.draft.createdAt.toISOString(),
  },
  activeConfig: settings.activeConfig
    ? {
        publicationId: settings.activeConfig.publicationId,
        configRevisionId: settings.activeConfig.configRevisionId,
        revisionNo: settings.activeConfig.revisionNo,
        publishedAt: settings.activeConfig.publishedAt.toISOString(),
      }
    : null,
  hasUnpublishedChanges: settings.activeConfig?.configRevisionId !== settings.draft.id,
});

const normalizeRequestedOrigins = (input: UpdateAssistantDraftRequest) => {
  const result = normalizeAssistantOrigins(input.allowedOrigins);
  if (!result.success) {
    throw createError({
      statusCode: 422,
      statusMessage: "Assistant Origin is invalid",
      data: { code: result.code, originIndex: result.index },
    });
  }
  return result.origins;
};

const configFromRequest = (input: UpdateAssistantDraftRequest): AssistantConfigValues => ({
  name: input.name,
  greeting: input.greeting,
  placeholder: input.placeholder,
  accentColor: input.accentColor.toUpperCase(),
  launcherPosition: input.launcherPosition,
  contactFallback: input.contactFallback,
  locale: input.locale,
  enabled: input.enabled,
  maintenanceMessage: input.maintenanceMessage,
  maxConversationTurns: input.maxConversationTurns,
  responseTimeoutSeconds: input.responseTimeoutSeconds,
  dailyRateLimit: input.dailyRateLimit,
  citationsEnabled: input.citationsEnabled,
});

export const getAssistantSettings = async (
  event: H3Event,
  projectId: string,
): Promise<AssistantSettingsResponse> => {
  const { session, project } = await requireProjectScope(event, projectId);
  return toResponse(await ensureAssistantSettingsRecord({ project, userId: session.userId }));
};

export const patchAssistantDraft = async (
  event: H3Event,
  projectId: string,
  input: UpdateAssistantDraftRequest,
): Promise<AssistantSettingsResponse> => {
  const { session, project } = await requireProjectScope(event, projectId, "owner");
  assertCsrf(event, session);
  const current = await ensureAssistantSettingsRecord({ project, userId: session.userId });
  const origins = normalizeRequestedOrigins(input);
  const config = configFromRequest(input);
  const result = await createAssistantConfigRevisionRecord({
    projectId: project.id,
    expectedVersion: input.expectedVersion,
    createdBy: session.userId,
    config,
    origins,
    contentChecksum: configChecksum(config, origins),
  });
  if (result === "conflict") {
    const latest = await findAssistantSettingsRecord(project.id);
    throw createError({
      statusCode: 409,
      statusMessage: "Assistant settings were changed by another request",
      data: {
        code: "ASSISTANT_VERSION_CONFLICT",
        expectedVersion: input.expectedVersion,
        currentVersion: latest?.assistant.configVersion ?? current.assistant.configVersion,
      },
    });
  }
  if (result === "unchanged") {
    throw createError({
      statusCode: 409,
      statusMessage: "Assistant settings are unchanged",
      data: { code: "ASSISTANT_CONFIG_UNCHANGED" },
    });
  }
  const updated = await findAssistantSettingsRecord(project.id);
  if (!updated) throw new Error("Assistant settings reload failed");
  await writeAuditEvent({
    projectId: project.id,
    actorUserId: session.userId,
    action: "assistant.config_revision_created",
    resourceType: "assistant_config_revision",
    resourceId: updated.draft.id,
    requestId: getRequestId(event),
    metadata: {
      revisionNo: updated.draft.revisionNo,
      originCount: origins.length,
      enabled: updated.draft.enabled,
    },
  });
  return toResponse(updated);
};

export const publishAssistant = async (
  event: H3Event,
  projectId: string,
  input: PublishAssistantRequest,
): Promise<AssistantSettingsResponse> => {
  const { session, project } = await requireProjectScope(event, projectId, "owner");
  assertCsrf(event, session);
  const current = await ensureAssistantSettingsRecord({ project, userId: session.userId });
  if (!current.draft.allowedOrigins.length) {
    throw createError({
      statusCode: 422,
      statusMessage: "At least one allowed Origin is required",
      data: { code: "ASSISTANT_ORIGIN_REQUIRED" },
    });
  }
  if (current.activeConfig?.configRevisionId === current.draft.id) {
    throw createError({
      statusCode: 409,
      statusMessage: "Assistant settings are already published",
      data: { code: "ASSISTANT_CONFIG_UNCHANGED" },
    });
  }
  const result = await publishAssistantConfigRecord({
    projectId: project.id,
    expectedVersion: input.expectedVersion,
    publishedBy: session.userId,
  });
  if (result.outcome === "conflict") {
    const latest = await findAssistantSettingsRecord(project.id);
    throw createError({
      statusCode: 409,
      statusMessage: "Assistant settings were changed by another request",
      data: {
        code: "ASSISTANT_VERSION_CONFLICT",
        expectedVersion: input.expectedVersion,
        currentVersion: latest?.assistant.configVersion ?? current.assistant.configVersion,
      },
    });
  }
  if (result.outcome === "prompt_missing") {
    throw createError({
      statusCode: 422,
      statusMessage: "Publish a system prompt before assistant settings",
      data: { code: "ASSISTANT_PROMPT_REQUIRED" },
    });
  }
  const published = await findAssistantSettingsRecord(project.id);
  if (!published) throw new Error("Published assistant settings reload failed");
  await writeAuditEvent({
    projectId: project.id,
    actorUserId: session.userId,
    action: "assistant.published",
    resourceType: "assistant_publication",
    resourceId: result.publicationId,
    requestId: getRequestId(event),
    metadata: {
      configRevisionId: published.draft.id,
      configRevisionNo: published.draft.revisionNo,
      supersededPublicationId: current.assistant.activePublicationId,
    },
  });
  return toResponse(published);
};
