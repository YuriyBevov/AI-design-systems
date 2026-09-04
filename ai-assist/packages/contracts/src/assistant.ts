import { z } from "zod";

export const assistantStatusSchema = z.enum(["draft", "active", "disabled"]);
export const assistantLauncherPositionSchema = z.enum(["left", "right"]);
export const assistantOriginEnvironmentSchema = z.enum(["production", "preview"]);

export const assistantOriginInputSchema = z
  .object({
    origin: z.string().trim().min(1).max(512),
    environment: assistantOriginEnvironmentSchema,
  })
  .strict();

export const assistantAllowedOriginResponseSchema = assistantOriginInputSchema.extend({
  scheme: z.enum(["http", "https"]),
  host: z.string().min(1).max(255),
  port: z.number().int().min(1).max(65_535).nullable(),
});

const assistantConfigFields = {
  name: z.string().trim().min(1).max(160),
  greeting: z.string().trim().min(1).max(2_000),
  placeholder: z.string().trim().min(1).max(200),
  accentColor: z.string().regex(/^#[A-Fa-f0-9]{6}$/u),
  launcherPosition: assistantLauncherPositionSchema,
  contactFallback: z.string().trim().min(1).max(2_000).nullable(),
  locale: z.string().trim().min(2).max(16),
  enabled: z.boolean(),
  maintenanceMessage: z.string().trim().min(1).max(2_000).nullable(),
  maxConversationTurns: z.number().int().min(1).max(50),
  responseTimeoutSeconds: z.number().int().min(5).max(120),
  dailyRateLimit: z.number().int().min(10).max(100_000),
  citationsEnabled: z.boolean(),
} as const;

export const assistantConfigSnapshotSchema = z.object({
  ...assistantConfigFields,
  allowedOrigins: z.array(assistantAllowedOriginResponseSchema).max(20),
});

export const assistantConfigRevisionResponseSchema = assistantConfigSnapshotSchema.extend({
  id: z.string().uuid(),
  assistantId: z.string().uuid(),
  revisionNo: z.number().int().positive(),
  contentChecksum: z.string().length(64),
  createdByEmail: z.string().email().nullable(),
  createdAt: z.string().datetime(),
});

export const assistantIdentityResponseSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  publicId: z.string().min(1).max(80),
  status: assistantStatusSchema,
  configVersion: z.number().int().positive(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const assistantActiveConfigResponseSchema = z.object({
  publicationId: z.string().uuid(),
  configRevisionId: z.string().uuid(),
  revisionNo: z.number().int().positive(),
  publishedAt: z.string().datetime(),
});

export const assistantSettingsResponseSchema = z.object({
  assistant: assistantIdentityResponseSchema,
  draft: assistantConfigRevisionResponseSchema,
  activeConfig: assistantActiveConfigResponseSchema.nullable(),
  hasUnpublishedChanges: z.boolean(),
});

export const updateAssistantDraftRequestSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    ...assistantConfigFields,
    allowedOrigins: z.array(assistantOriginInputSchema).min(1).max(20),
  })
  .strict();

export const publishAssistantRequestSchema = z
  .object({ expectedVersion: z.number().int().positive() })
  .strict();

export type AssistantStatus = z.infer<typeof assistantStatusSchema>;
export type AssistantLauncherPosition = z.infer<typeof assistantLauncherPositionSchema>;
export type AssistantOriginEnvironment = z.infer<typeof assistantOriginEnvironmentSchema>;
export type AssistantOriginInput = z.infer<typeof assistantOriginInputSchema>;
export type AssistantAllowedOriginResponse = z.infer<typeof assistantAllowedOriginResponseSchema>;
export type AssistantConfigSnapshot = z.infer<typeof assistantConfigSnapshotSchema>;
export type AssistantConfigRevisionResponse = z.infer<typeof assistantConfigRevisionResponseSchema>;
export type AssistantIdentityResponse = z.infer<typeof assistantIdentityResponseSchema>;
export type AssistantActiveConfigResponse = z.infer<typeof assistantActiveConfigResponseSchema>;
export type AssistantSettingsResponse = z.infer<typeof assistantSettingsResponseSchema>;
export type UpdateAssistantDraftRequest = z.infer<typeof updateAssistantDraftRequestSchema>;
export type PublishAssistantRequest = z.infer<typeof publishAssistantRequestSchema>;
