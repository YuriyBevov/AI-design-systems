import { z } from "zod";

import { assistantLauncherPositionSchema } from "./assistant.js";
import { knowledgeRetrievalSourceSchema } from "./knowledge.js";

const widgetLocaleSchema = z.string().trim().min(2).max(16);
const widgetAssistantIdSchema = z.string().trim().min(16).max(80).startsWith("asst_");
const widgetConversationIdSchema = z.string().trim().min(16).max(80).startsWith("conv_");

export const widgetMessageRoleSchema = z.enum(["user", "assistant"]);
export const widgetMessageStatusSchema = z.enum(["pending", "completed", "failed"]);

export const widgetMessageResponseSchema = z.object({
  id: z.string().uuid(),
  role: widgetMessageRoleSchema,
  content: z.string().max(262_144),
  status: widgetMessageStatusSchema,
  createdAt: z.string().datetime(),
});

export const widgetConversationResponseSchema = z.object({
  id: widgetConversationIdSchema,
  status: z.enum(["active", "closed"]),
  messages: z.array(widgetMessageResponseSchema).max(100),
  startedAt: z.string().datetime(),
  lastActivityAt: z.string().datetime(),
});

export const widgetPublicConfigSchema = z.object({
  name: z.string().min(1).max(160),
  greeting: z.string().min(1).max(2_000),
  placeholder: z.string().min(1).max(200),
  accentColor: z.string().regex(/^#[A-F0-9]{6}$/u),
  launcherPosition: assistantLauncherPositionSchema,
  locale: widgetLocaleSchema,
  enabled: z.boolean(),
  maintenanceMessage: z.string().min(1).max(2_000).nullable(),
  features: z.object({ citations: z.boolean() }),
});

export const createWidgetSessionRequestSchema = z
  .object({
    assistantId: widgetAssistantIdSchema,
    widgetVersion: z.string().trim().min(1).max(40),
    locale: widgetLocaleSchema,
  })
  .strict();

export const widgetSessionResponseSchema = z.object({
  expiresAt: z.string().datetime(),
  config: widgetPublicConfigSchema,
  conversation: widgetConversationResponseSchema.nullable(),
});

export const createWidgetSessionResponseSchema = widgetSessionResponseSchema.extend({
  sessionToken: z.string().min(32).max(256),
});

export const createWidgetConversationRequestSchema = z.object({}).strict();

const widgetPageContextSchema = z
  .object({
    url: z.string().url().max(2_048),
    title: z.string().trim().min(1).max(500).nullable().default(null),
  })
  .strict();

export const widgetChatRequestSchema = z
  .object({
    conversationId: widgetConversationIdSchema.nullable().default(null),
    message: z.string().trim().min(1).max(4_000),
    page: widgetPageContextSchema.nullable().default(null),
  })
  .strict();

export const widgetSseMetaSchema = z.object({
  requestId: z.string().min(1).max(128),
  conversationId: widgetConversationIdSchema,
  userMessageId: z.string().uuid(),
  assistantMessageId: z.string().uuid(),
});

export const widgetSseDeltaSchema = z.object({ text: z.string().min(1).max(32_768) });

export const widgetSseCitationSchema = knowledgeRetrievalSourceSchema
  .pick({ title: true, canonicalUrl: true })
  .extend({
    id: z.string().min(1).max(80),
    url: z.string().url().nullable(),
  })
  .omit({ canonicalUrl: true });

export const widgetSseUsageSchema = z.object({
  model: z.string().min(1).max(255),
  inputTokens: z.number().int().nonnegative().nullable(),
  outputTokens: z.number().int().nonnegative().nullable(),
});

export const widgetSseDoneSchema = z.object({
  finishReason: z.string().min(1).max(100).nullable(),
});

export const widgetSseErrorSchema = z.object({
  code: z.string().min(1).max(100),
  message: z.string().min(1).max(500),
  retryable: z.boolean(),
  requestId: z.string().min(1).max(128),
});

export type WidgetMessageRole = z.infer<typeof widgetMessageRoleSchema>;
export type WidgetMessageStatus = z.infer<typeof widgetMessageStatusSchema>;
export type WidgetMessageResponse = z.infer<typeof widgetMessageResponseSchema>;
export type WidgetConversationResponse = z.infer<typeof widgetConversationResponseSchema>;
export type WidgetPublicConfig = z.infer<typeof widgetPublicConfigSchema>;
export type CreateWidgetSessionRequest = z.infer<typeof createWidgetSessionRequestSchema>;
export type WidgetSessionResponse = z.infer<typeof widgetSessionResponseSchema>;
export type CreateWidgetSessionResponse = z.infer<typeof createWidgetSessionResponseSchema>;
export type WidgetChatRequest = z.infer<typeof widgetChatRequestSchema>;
export type WidgetSseMeta = z.infer<typeof widgetSseMetaSchema>;
export type WidgetSseDelta = z.infer<typeof widgetSseDeltaSchema>;
export type WidgetSseCitation = z.infer<typeof widgetSseCitationSchema>;
export type WidgetSseUsage = z.infer<typeof widgetSseUsageSchema>;
export type WidgetSseDone = z.infer<typeof widgetSseDoneSchema>;
export type WidgetSseError = z.infer<typeof widgetSseErrorSchema>;
