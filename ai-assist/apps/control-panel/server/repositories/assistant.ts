import { and, asc, eq, sql } from "drizzle-orm";

import {
  assistantAllowedOrigins,
  assistantConfigRevisions,
  assistantPublications,
  assistants,
  users,
} from "@ai-assist/database";
import type {
  AssistantConfigSnapshot,
  AssistantLauncherPosition,
  AssistantOriginEnvironment,
  AssistantStatus,
} from "@ai-assist/contracts";
import type { NormalizedAssistantOrigin } from "@ai-assist/domain";

import { getInfrastructure } from "../utils/infrastructure";

export type AssistantRecord = {
  id: string;
  projectId: string;
  publicId: string;
  status: AssistantStatus;
  configVersion: number;
  activePublicationId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type AssistantConfigRecord = Omit<AssistantConfigSnapshot, "allowedOrigins"> & {
  id: string;
  assistantId: string;
  revisionNo: number;
  contentChecksum: string;
  createdByEmail: string | null;
  createdAt: Date;
  allowedOrigins: NormalizedAssistantOrigin[];
};

export type AssistantActiveConfigRecord = {
  publicationId: string;
  configRevisionId: string;
  revisionNo: number;
  publishedAt: Date;
};

export type AssistantSettingsRecord = {
  assistant: AssistantRecord;
  draft: AssistantConfigRecord;
  activeConfig: AssistantActiveConfigRecord | null;
};

export type AssistantConfigSnapshotRecord = {
  revisionNo: number;
  config: AssistantConfigSnapshot;
};

export type AssistantConfigValues = Omit<AssistantConfigSnapshot, "allowedOrigins">;

const assistantSelection = {
  id: assistants.id,
  projectId: assistants.projectId,
  publicId: assistants.publicId,
  status: assistants.status,
  configVersion: assistants.configVersion,
  activePublicationId: assistants.activePublicationId,
  createdAt: assistants.createdAt,
  updatedAt: assistants.updatedAt,
};

const configSelection = {
  id: assistantConfigRevisions.id,
  assistantId: assistantConfigRevisions.assistantId,
  revisionNo: assistantConfigRevisions.revisionNo,
  name: assistantConfigRevisions.name,
  greeting: assistantConfigRevisions.greeting,
  placeholder: assistantConfigRevisions.placeholder,
  accentColor: assistantConfigRevisions.accentColor,
  launcherPosition: assistantConfigRevisions.launcherPosition,
  contactFallback: assistantConfigRevisions.contactFallback,
  locale: assistantConfigRevisions.locale,
  enabled: assistantConfigRevisions.enabled,
  maintenanceMessage: assistantConfigRevisions.maintenanceMessage,
  maxConversationTurns: assistantConfigRevisions.maxConversationTurns,
  responseTimeoutSeconds: assistantConfigRevisions.responseTimeoutSeconds,
  dailyRateLimit: assistantConfigRevisions.dailyRateLimit,
  citationsEnabled: assistantConfigRevisions.citationsEnabled,
  contentChecksum: assistantConfigRevisions.contentChecksum,
  createdByEmail: users.emailNormalized,
  createdAt: assistantConfigRevisions.createdAt,
};

const toConfigValues = (config: AssistantConfigValues) => ({
  name: config.name,
  greeting: config.greeting,
  placeholder: config.placeholder,
  accentColor: config.accentColor.toUpperCase(),
  launcherPosition: config.launcherPosition,
  contactFallback: config.contactFallback,
  locale: config.locale,
  enabled: config.enabled,
  maintenanceMessage: config.maintenanceMessage,
  maxConversationTurns: config.maxConversationTurns,
  responseTimeoutSeconds: config.responseTimeoutSeconds,
  dailyRateLimit: config.dailyRateLimit,
  citationsEnabled: config.citationsEnabled,
});

export const ensureAssistantDraftRecord = async (input: {
  projectId: string;
  publicId: string;
  createdBy: string;
  config: AssistantConfigValues;
  origins: NormalizedAssistantOrigin[];
  contentChecksum: string;
}): Promise<void> =>
  getInfrastructure().database.db.transaction(async (transaction) => {
    await transaction
      .insert(assistants)
      .values({ projectId: input.projectId, publicId: input.publicId })
      .onConflictDoNothing({ target: assistants.projectId });

    const [assistant] = await transaction
      .select({ id: assistants.id })
      .from(assistants)
      .where(eq(assistants.projectId, input.projectId))
      .limit(1);
    if (!assistant) throw new Error("Assistant creation failed");

    await transaction.execute(
      sql`select ${assistants.id} from ${assistants} where ${assistants.id} = ${assistant.id} for update`,
    );
    const [lockedAssistant] = await transaction
      .select({ configVersion: assistants.configVersion })
      .from(assistants)
      .where(eq(assistants.id, assistant.id))
      .limit(1);
    if (!lockedAssistant) throw new Error("Assistant lock failed");
    if (lockedAssistant.configVersion > 0) return;

    const [revision] = await transaction
      .insert(assistantConfigRevisions)
      .values({
        assistantId: assistant.id,
        revisionNo: 1,
        ...toConfigValues(input.config),
        contentChecksum: input.contentChecksum,
        createdBy: input.createdBy,
      })
      .returning({ id: assistantConfigRevisions.id });
    if (!revision) throw new Error("Assistant config revision insert failed");
    if (input.origins.length > 0) {
      await transaction.insert(assistantAllowedOrigins).values(
        input.origins.map((origin) => ({
          configRevisionId: revision.id,
          origin: origin.origin,
          scheme: origin.scheme,
          host: origin.host,
          port: origin.port,
          environment: origin.environment,
        })),
      );
    }
    await transaction
      .update(assistants)
      .set({ configVersion: 1, updatedAt: new Date() })
      .where(eq(assistants.id, assistant.id));
  });

export const findAssistantSettingsRecord = async (
  projectId: string,
): Promise<AssistantSettingsRecord | null> => {
  const [assistant] = await getInfrastructure()
    .database.db.select(assistantSelection)
    .from(assistants)
    .where(eq(assistants.projectId, projectId))
    .limit(1);
  if (!assistant || assistant.configVersion < 1) return null;

  const [config] = await getInfrastructure()
    .database.db.select(configSelection)
    .from(assistantConfigRevisions)
    .leftJoin(users, eq(users.id, assistantConfigRevisions.createdBy))
    .where(
      and(
        eq(assistantConfigRevisions.assistantId, assistant.id),
        eq(assistantConfigRevisions.revisionNo, assistant.configVersion),
      ),
    )
    .limit(1);
  if (!config) return null;

  const origins = await getInfrastructure()
    .database.db.select({
      origin: assistantAllowedOrigins.origin,
      scheme: assistantAllowedOrigins.scheme,
      host: assistantAllowedOrigins.host,
      port: assistantAllowedOrigins.port,
      environment: assistantAllowedOrigins.environment,
    })
    .from(assistantAllowedOrigins)
    .where(eq(assistantAllowedOrigins.configRevisionId, config.id))
    .orderBy(asc(assistantAllowedOrigins.origin));

  const [activeConfig] = assistant.activePublicationId
    ? await getInfrastructure()
        .database.db.select({
          publicationId: assistantPublications.id,
          configRevisionId: assistantPublications.configRevisionId,
          revisionNo: assistantConfigRevisions.revisionNo,
          publishedAt: assistantPublications.publishedAt,
        })
        .from(assistantPublications)
        .innerJoin(
          assistantConfigRevisions,
          eq(assistantConfigRevisions.id, assistantPublications.configRevisionId),
        )
        .where(eq(assistantPublications.id, assistant.activePublicationId))
        .limit(1)
    : [];

  return {
    assistant,
    draft: {
      ...config,
      launcherPosition: config.launcherPosition as AssistantLauncherPosition,
      allowedOrigins: origins.map((origin) => ({
        ...origin,
        scheme: origin.scheme as "http" | "https",
        environment: origin.environment as AssistantOriginEnvironment,
      })),
    },
    activeConfig: activeConfig ?? null,
  };
};

export const findAssistantConfigSnapshotRecord = async (
  projectId: string,
  configRevisionId: string,
): Promise<AssistantConfigSnapshotRecord | null> => {
  const [config] = await getInfrastructure()
    .database.db.select(configSelection)
    .from(assistantConfigRevisions)
    .innerJoin(assistants, eq(assistants.id, assistantConfigRevisions.assistantId))
    .leftJoin(users, eq(users.id, assistantConfigRevisions.createdBy))
    .where(
      and(eq(assistants.projectId, projectId), eq(assistantConfigRevisions.id, configRevisionId)),
    )
    .limit(1);
  if (!config) return null;
  const origins = await getInfrastructure()
    .database.db.select({
      origin: assistantAllowedOrigins.origin,
      scheme: assistantAllowedOrigins.scheme,
      host: assistantAllowedOrigins.host,
      port: assistantAllowedOrigins.port,
      environment: assistantAllowedOrigins.environment,
    })
    .from(assistantAllowedOrigins)
    .where(eq(assistantAllowedOrigins.configRevisionId, config.id))
    .orderBy(asc(assistantAllowedOrigins.origin));

  return {
    revisionNo: config.revisionNo,
    config: {
      name: config.name,
      greeting: config.greeting,
      placeholder: config.placeholder,
      accentColor: config.accentColor,
      launcherPosition: config.launcherPosition as AssistantLauncherPosition,
      contactFallback: config.contactFallback,
      locale: config.locale,
      enabled: config.enabled,
      maintenanceMessage: config.maintenanceMessage,
      maxConversationTurns: config.maxConversationTurns,
      responseTimeoutSeconds: config.responseTimeoutSeconds,
      dailyRateLimit: config.dailyRateLimit,
      citationsEnabled: config.citationsEnabled,
      allowedOrigins: origins.map((origin) => ({
        ...origin,
        scheme: origin.scheme as "http" | "https",
        environment: origin.environment as AssistantOriginEnvironment,
      })),
    },
  };
};

export type CreateAssistantConfigRevisionResult = "created" | "conflict" | "unchanged";

export const createAssistantConfigRevisionRecord = async (input: {
  projectId: string;
  expectedVersion: number;
  createdBy: string;
  config: AssistantConfigValues;
  origins: NormalizedAssistantOrigin[];
  contentChecksum: string;
}): Promise<CreateAssistantConfigRevisionResult> =>
  getInfrastructure().database.db.transaction(async (transaction) => {
    const [assistant] = await transaction
      .select({ id: assistants.id })
      .from(assistants)
      .where(eq(assistants.projectId, input.projectId))
      .limit(1);
    if (!assistant) return "conflict";
    await transaction.execute(
      sql`select ${assistants.id} from ${assistants} where ${assistants.id} = ${assistant.id} for update`,
    );
    const [lockedAssistant] = await transaction
      .select({ configVersion: assistants.configVersion })
      .from(assistants)
      .where(eq(assistants.id, assistant.id))
      .limit(1);
    if (!lockedAssistant || lockedAssistant.configVersion !== input.expectedVersion) {
      return "conflict";
    }
    const [latest] = await transaction
      .select({ contentChecksum: assistantConfigRevisions.contentChecksum })
      .from(assistantConfigRevisions)
      .where(
        and(
          eq(assistantConfigRevisions.assistantId, assistant.id),
          eq(assistantConfigRevisions.revisionNo, lockedAssistant.configVersion),
        ),
      )
      .limit(1);
    if (latest?.contentChecksum === input.contentChecksum) return "unchanged";

    const revisionNo = lockedAssistant.configVersion + 1;
    const [revision] = await transaction
      .insert(assistantConfigRevisions)
      .values({
        assistantId: assistant.id,
        revisionNo,
        ...toConfigValues(input.config),
        contentChecksum: input.contentChecksum,
        createdBy: input.createdBy,
      })
      .returning({ id: assistantConfigRevisions.id });
    if (!revision) throw new Error("Assistant config revision insert failed");
    if (input.origins.length > 0) {
      await transaction.insert(assistantAllowedOrigins).values(
        input.origins.map((origin) => ({
          configRevisionId: revision.id,
          origin: origin.origin,
          scheme: origin.scheme,
          host: origin.host,
          port: origin.port,
          environment: origin.environment,
        })),
      );
    }
    await transaction
      .update(assistants)
      .set({ configVersion: revisionNo, updatedAt: new Date() })
      .where(
        and(eq(assistants.id, assistant.id), eq(assistants.configVersion, input.expectedVersion)),
      );
    return "created";
  });

export type PublishAssistantConfigRecordResult =
  | { outcome: "published"; publicationId: string }
  | { outcome: "conflict" }
  | { outcome: "prompt_missing" };

export const publishAssistantConfigRecord = async (input: {
  projectId: string;
  expectedVersion: number;
  publishedBy: string;
}): Promise<PublishAssistantConfigRecordResult> =>
  getInfrastructure().database.db.transaction(async (transaction) => {
    const [assistant] = await transaction
      .select({ id: assistants.id })
      .from(assistants)
      .where(eq(assistants.projectId, input.projectId))
      .limit(1);
    if (!assistant) return { outcome: "conflict" };
    await transaction.execute(
      sql`select ${assistants.id} from ${assistants} where ${assistants.id} = ${assistant.id} for update`,
    );
    const [lockedAssistant] = await transaction
      .select({
        configVersion: assistants.configVersion,
        activePublicationId: assistants.activePublicationId,
      })
      .from(assistants)
      .where(eq(assistants.id, assistant.id))
      .limit(1);
    if (!lockedAssistant || lockedAssistant.configVersion !== input.expectedVersion) {
      return { outcome: "conflict" };
    }
    if (!lockedAssistant.activePublicationId) return { outcome: "prompt_missing" };

    const [activePublication] = await transaction
      .select({
        promptRevisionId: assistantPublications.promptRevisionId,
        modelSettingsSnapshot: assistantPublications.modelSettingsSnapshot,
      })
      .from(assistantPublications)
      .where(eq(assistantPublications.id, lockedAssistant.activePublicationId))
      .limit(1);
    const [configRevision] = await transaction
      .select({ id: assistantConfigRevisions.id })
      .from(assistantConfigRevisions)
      .where(
        and(
          eq(assistantConfigRevisions.assistantId, assistant.id),
          eq(assistantConfigRevisions.revisionNo, lockedAssistant.configVersion),
        ),
      )
      .limit(1);
    if (!activePublication || !configRevision) return { outcome: "conflict" };

    const [publication] = await transaction
      .insert(assistantPublications)
      .values({
        assistantId: assistant.id,
        promptRevisionId: activePublication.promptRevisionId,
        configRevisionId: configRevision.id,
        supersedesId: lockedAssistant.activePublicationId,
        modelSettingsSnapshot: activePublication.modelSettingsSnapshot,
        publishedBy: input.publishedBy,
      })
      .returning({ id: assistantPublications.id, publishedAt: assistantPublications.publishedAt });
    if (!publication) throw new Error("Assistant publication insert failed");
    await transaction
      .update(assistants)
      .set({
        activePublicationId: publication.id,
        status: "active",
        updatedAt: publication.publishedAt,
      })
      .where(eq(assistants.id, assistant.id));
    return { outcome: "published", publicationId: publication.id };
  });
