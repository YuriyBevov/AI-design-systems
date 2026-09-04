import { and, desc, eq, gt, isNull, ne, sql } from "drizzle-orm";

import {
  assistantAllowedOrigins,
  assistantConfigRevisions,
  assistantPublications,
  assistants,
  projects,
  promptRevisions,
  prompts,
  widgetConversations,
  widgetGenerationRuns,
  widgetGenerationSources,
  widgetMessages,
  widgetSessions,
  type PromptModelSettingsSnapshot,
} from "@ai-assist/database";
import type { QualificationState } from "@ai-assist/domain";

import { getInfrastructure } from "../utils/infrastructure";

export type WidgetRuntimeRecord = {
  projectId: string;
  projectName: string;
  projectTimezone: string;
  conversationRetentionDays: number;
  assistantId: string;
  assistantPublicId: string;
  publicationId: string;
  promptRevisionId: string;
  promptContent: string;
  modelSettings: PromptModelSettingsSnapshot;
  configRevisionId: string;
  name: string;
  greeting: string;
  placeholder: string;
  accentColor: string;
  launcherPosition: string;
  contactFallback: string | null;
  locale: string;
  enabled: boolean;
  maintenanceMessage: string | null;
  maxConversationTurns: number;
  responseTimeoutSeconds: number;
  dailyRateLimit: number;
  citationsEnabled: boolean;
};

export type WidgetSessionRecord = {
  id: string;
  projectId: string;
  assistantId: string;
  assistantPublicId: string;
  originHash: string;
  locale: string;
  expiresAt: Date;
};

export type WidgetConversationRecord = {
  id: string;
  publicId: string;
  widgetSessionId: string;
  projectId: string;
  assistantId: string;
  status: "active" | "closed";
  locale: string;
  qualificationState: QualificationState;
  summary: string | null;
  lastActivityAt: Date;
  expiresAt: Date;
  createdAt: Date;
};

export type WidgetMessageRecord = {
  id: string;
  role: "user" | "assistant";
  content: string;
  status: "pending" | "completed" | "failed";
  createdAt: Date;
};

export const findWidgetRuntimeRecord = async (
  assistantPublicId: string,
  origin: string,
): Promise<WidgetRuntimeRecord | null> => {
  const rows = await getInfrastructure()
    .database.db.select({
      projectId: projects.id,
      projectName: projects.name,
      projectTimezone: projects.timezone,
      conversationRetentionDays: projects.conversationRetentionDays,
      assistantId: assistants.id,
      assistantPublicId: assistants.publicId,
      publicationId: assistantPublications.id,
      promptRevisionId: promptRevisions.id,
      promptContent: promptRevisions.content,
      modelSettings: assistantPublications.modelSettingsSnapshot,
      configRevisionId: assistantConfigRevisions.id,
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
    })
    .from(assistants)
    .innerJoin(projects, eq(projects.id, assistants.projectId))
    .innerJoin(assistantPublications, eq(assistantPublications.id, assistants.activePublicationId))
    .innerJoin(promptRevisions, eq(promptRevisions.id, assistantPublications.promptRevisionId))
    .innerJoin(prompts, eq(prompts.id, promptRevisions.promptId))
    .innerJoin(
      assistantConfigRevisions,
      eq(assistantConfigRevisions.id, assistantPublications.configRevisionId),
    )
    .innerJoin(
      assistantAllowedOrigins,
      and(
        eq(assistantAllowedOrigins.configRevisionId, assistantConfigRevisions.id),
        eq(assistantAllowedOrigins.origin, origin),
        eq(assistantAllowedOrigins.enabled, true),
      ),
    )
    .where(
      and(
        eq(assistants.publicId, assistantPublicId),
        eq(assistants.status, "active"),
        eq(projects.status, "active"),
        eq(prompts.status, "published"),
        eq(prompts.projectId, projects.id),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
};

export const createWidgetSessionRecord = async (input: {
  projectId: string;
  assistantId: string;
  tokenHash: string;
  originHash: string;
  locale: string;
  widgetVersion: string;
  expiresAt: Date;
}): Promise<WidgetSessionRecord> => {
  const [session] = await getInfrastructure()
    .database.db.insert(widgetSessions)
    .values(input)
    .returning({
      id: widgetSessions.id,
      projectId: widgetSessions.projectId,
      assistantId: widgetSessions.assistantId,
      originHash: widgetSessions.originHash,
      locale: widgetSessions.locale,
      expiresAt: widgetSessions.expiresAt,
    });
  if (!session) throw new Error("Widget session creation failed");
  const [assistant] = await getInfrastructure()
    .database.db.select({ publicId: assistants.publicId })
    .from(assistants)
    .where(eq(assistants.id, session.assistantId))
    .limit(1);
  if (!assistant) throw new Error("Widget assistant lookup failed");
  return { ...session, assistantPublicId: assistant.publicId };
};

export const findActiveWidgetSessionRecord = async (
  tokenHash: string,
): Promise<WidgetSessionRecord | null> => {
  const rows = await getInfrastructure()
    .database.db.select({
      id: widgetSessions.id,
      projectId: widgetSessions.projectId,
      assistantId: widgetSessions.assistantId,
      assistantPublicId: assistants.publicId,
      originHash: widgetSessions.originHash,
      locale: widgetSessions.locale,
      expiresAt: widgetSessions.expiresAt,
    })
    .from(widgetSessions)
    .innerJoin(assistants, eq(assistants.id, widgetSessions.assistantId))
    .innerJoin(projects, eq(projects.id, widgetSessions.projectId))
    .where(
      and(
        eq(widgetSessions.tokenHash, tokenHash),
        isNull(widgetSessions.revokedAt),
        gt(widgetSessions.expiresAt, new Date()),
        eq(assistants.status, "active"),
        eq(projects.status, "active"),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
};

export const touchWidgetSessionRecord = async (sessionId: string): Promise<void> => {
  const now = new Date();
  await getInfrastructure()
    .database.db.update(widgetSessions)
    .set({ lastSeenAt: now, updatedAt: now })
    .where(and(eq(widgetSessions.id, sessionId), isNull(widgetSessions.revokedAt)));
};

const conversationSelection = {
  id: widgetConversations.id,
  publicId: widgetConversations.publicId,
  widgetSessionId: widgetConversations.widgetSessionId,
  projectId: widgetConversations.projectId,
  assistantId: widgetConversations.assistantId,
  status: widgetConversations.status,
  locale: widgetConversations.locale,
  qualificationState: widgetConversations.qualificationState,
  summary: widgetConversations.summary,
  lastActivityAt: widgetConversations.lastActivityAt,
  expiresAt: widgetConversations.expiresAt,
  createdAt: widgetConversations.createdAt,
};

export const findActiveWidgetConversationRecord = async (
  sessionId: string,
  publicId?: string,
): Promise<WidgetConversationRecord | null> => {
  const rows = await getInfrastructure()
    .database.db.select(conversationSelection)
    .from(widgetConversations)
    .where(
      and(
        eq(widgetConversations.widgetSessionId, sessionId),
        eq(widgetConversations.status, "active"),
        gt(widgetConversations.expiresAt, new Date()),
        ...(publicId ? [eq(widgetConversations.publicId, publicId)] : []),
      ),
    )
    .orderBy(desc(widgetConversations.lastActivityAt))
    .limit(1);
  return rows[0] ?? null;
};

export const createWidgetConversationRecord = async (input: {
  publicId: string;
  session: WidgetSessionRecord;
  qualificationState: QualificationState;
  expiresAt: Date;
}): Promise<WidgetConversationRecord> =>
  getInfrastructure().database.db.transaction(async (transaction) => {
    await transaction.execute(
      sql`select ${widgetSessions.id} from ${widgetSessions} where ${widgetSessions.id} = ${input.session.id} for update`,
    );
    const now = new Date();
    await transaction
      .update(widgetConversations)
      .set({ status: "closed", updatedAt: now })
      .where(
        and(
          eq(widgetConversations.widgetSessionId, input.session.id),
          eq(widgetConversations.status, "active"),
        ),
      );
    const [conversation] = await transaction
      .insert(widgetConversations)
      .values({
        publicId: input.publicId,
        widgetSessionId: input.session.id,
        projectId: input.session.projectId,
        assistantId: input.session.assistantId,
        locale: input.session.locale,
        qualificationState: input.qualificationState,
        expiresAt: input.expiresAt,
      })
      .returning(conversationSelection);
    if (!conversation) throw new Error("Widget conversation creation failed");
    return conversation;
  });

export const listWidgetMessageRecords = async (
  conversationId: string,
  limit: number,
): Promise<WidgetMessageRecord[]> => {
  const rows = await getInfrastructure()
    .database.db.select({
      id: widgetMessages.id,
      role: widgetMessages.role,
      content: widgetMessages.content,
      status: widgetMessages.status,
      createdAt: widgetMessages.createdAt,
    })
    .from(widgetMessages)
    .where(eq(widgetMessages.conversationId, conversationId))
    .orderBy(desc(widgetMessages.createdAt), desc(widgetMessages.id))
    .limit(limit);
  return rows.reverse();
};

export type BeginWidgetGenerationResult =
  | { outcome: "created"; runId: string; userMessageId: string; assistantMessageId: string }
  | { outcome: "duplicate" }
  | { outcome: "busy" }
  | { outcome: "conversation_unavailable" };

export const beginWidgetGenerationRecord = async (input: {
  session: WidgetSessionRecord;
  conversation: WidgetConversationRecord;
  publicationId: string;
  modelId: string;
  idempotencyKeyHash: string;
  requestId: string;
  message: string;
  qualificationState: QualificationState;
}): Promise<BeginWidgetGenerationResult> =>
  getInfrastructure().database.db.transaction(async (transaction) => {
    await transaction.execute(
      sql`select ${widgetConversations.id} from ${widgetConversations} where ${widgetConversations.id} = ${input.conversation.id} for update`,
    );
    const [conversation] = await transaction
      .select({ status: widgetConversations.status, expiresAt: widgetConversations.expiresAt })
      .from(widgetConversations)
      .where(
        and(
          eq(widgetConversations.id, input.conversation.id),
          eq(widgetConversations.widgetSessionId, input.session.id),
        ),
      )
      .limit(1);
    if (!conversation || conversation.status !== "active" || conversation.expiresAt <= new Date()) {
      return { outcome: "conversation_unavailable" as const };
    }
    const [duplicate] = await transaction
      .select({ id: widgetGenerationRuns.id })
      .from(widgetGenerationRuns)
      .where(
        and(
          eq(widgetGenerationRuns.widgetSessionId, input.session.id),
          eq(widgetGenerationRuns.idempotencyKeyHash, input.idempotencyKeyHash),
        ),
      )
      .limit(1);
    if (duplicate) return { outcome: "duplicate" as const };
    const [running] = await transaction
      .select({ id: widgetGenerationRuns.id })
      .from(widgetGenerationRuns)
      .where(
        and(
          eq(widgetGenerationRuns.conversationId, input.conversation.id),
          eq(widgetGenerationRuns.status, "running"),
        ),
      )
      .limit(1);
    if (running) return { outcome: "busy" as const };

    const [run] = await transaction
      .insert(widgetGenerationRuns)
      .values({
        projectId: input.session.projectId,
        widgetSessionId: input.session.id,
        conversationId: input.conversation.id,
        publicationId: input.publicationId,
        idempotencyKeyHash: input.idempotencyKeyHash,
        modelId: input.modelId,
        requestId: input.requestId,
      })
      .returning({ id: widgetGenerationRuns.id });
    if (!run) throw new Error("Widget generation creation failed");
    const now = new Date();
    const [userMessage] = await transaction
      .insert(widgetMessages)
      .values({
        conversationId: input.conversation.id,
        role: "user",
        content: input.message,
        status: "completed",
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: widgetMessages.id });
    const [assistantMessage] = await transaction
      .insert(widgetMessages)
      .values({
        conversationId: input.conversation.id,
        role: "assistant",
        content: "",
        status: "pending",
        createdAt: new Date(now.getTime() + 1),
        updatedAt: now,
      })
      .returning({ id: widgetMessages.id });
    if (!userMessage || !assistantMessage) throw new Error("Widget message creation failed");
    await transaction
      .update(widgetGenerationRuns)
      .set({
        userMessageId: userMessage.id,
        assistantMessageId: assistantMessage.id,
        updatedAt: now,
      })
      .where(eq(widgetGenerationRuns.id, run.id));
    await transaction
      .update(widgetConversations)
      .set({ qualificationState: input.qualificationState, lastActivityAt: now, updatedAt: now })
      .where(eq(widgetConversations.id, input.conversation.id));
    return {
      outcome: "created" as const,
      runId: run.id,
      userMessageId: userMessage.id,
      assistantMessageId: assistantMessage.id,
    };
  });

export const completeWidgetGenerationRecord = async (input: {
  runId: string;
  assistantMessageId: string;
  answer: string;
  resolvedModelId: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  firstTokenLatencyMs: number | null;
  totalLatencyMs: number;
  finishReason: string | null;
  sources: Array<{ chunkId: string; score: number; cited: boolean }>;
}): Promise<void> =>
  getInfrastructure().database.db.transaction(async (transaction) => {
    const now = new Date();
    await transaction
      .update(widgetMessages)
      .set({ content: input.answer, status: "completed", updatedAt: now })
      .where(eq(widgetMessages.id, input.assistantMessageId));
    await transaction
      .update(widgetGenerationRuns)
      .set({
        status: "completed",
        resolvedModelId: input.resolvedModelId,
        inputTokens: input.inputTokens,
        outputTokens: input.outputTokens,
        firstTokenLatencyMs: input.firstTokenLatencyMs,
        totalLatencyMs: input.totalLatencyMs,
        finishReason: input.finishReason,
        finishedAt: now,
        updatedAt: now,
      })
      .where(eq(widgetGenerationRuns.id, input.runId));
    if (input.sources.length) {
      await transaction.insert(widgetGenerationSources).values(
        input.sources.map((source, index) => ({
          generationRunId: input.runId,
          knowledgeChunkId: source.chunkId,
          rank: index + 1,
          score: source.score,
          cited: source.cited,
        })),
      );
    }
  });

export const failWidgetGenerationRecord = async (input: {
  runId: string;
  assistantMessageId: string;
  status: "failed" | "cancelled";
  errorCode: string;
  totalLatencyMs: number;
}): Promise<void> => {
  const now = new Date();
  await getInfrastructure().database.db.transaction(async (transaction) => {
    await transaction
      .update(widgetMessages)
      .set({ status: "failed", updatedAt: now })
      .where(eq(widgetMessages.id, input.assistantMessageId));
    await transaction
      .update(widgetGenerationRuns)
      .set({
        status: input.status,
        errorCode: input.errorCode,
        totalLatencyMs: input.totalLatencyMs,
        finishedAt: now,
        updatedAt: now,
      })
      .where(
        and(eq(widgetGenerationRuns.id, input.runId), ne(widgetGenerationRuns.status, "completed")),
      );
  });
};
