import { z } from "zod";

export const providerCredentialStatusSchema = z.enum(["verified", "invalid", "disabled"]);

export const providerVerificationMetadataSchema = z.object({
  keyName: z.string().nullable(),
  budgetRemaining: z.number().nullable(),
  budgetInitial: z.number().nullable(),
  budgetResetAt: z.string().datetime().nullable(),
  expiresAt: z.string().datetime().nullable(),
  allowedModels: z.array(z.string()).nullable(),
  piiMode: z.enum(["mask", "block"]).nullable(),
});

export const providerCredentialResponseSchema = z.object({
  id: z.string().uuid(),
  provider: z.literal("aitunnel"),
  maskedHint: z.string(),
  status: providerCredentialStatusSchema,
  keyVersion: z.number().int().positive(),
  lastVerifiedAt: z.string().datetime().nullable(),
  lastErrorCode: z.string().nullable(),
  verification: providerVerificationMetadataSchema.nullable(),
  updatedAt: z.string().datetime(),
});

export const providerStateResponseSchema = z.object({
  provider: z.literal("aitunnel"),
  credential: providerCredentialResponseSchema.nullable(),
});

export const saveProviderCredentialRequestSchema = z
  .object({
    apiKey: z
      .string()
      .trim()
      .min(20)
      .max(512)
      .regex(/^sk-aitunnel-[A-Za-z0-9_-]+$/u, "Invalid AITUNNEL key format"),
  })
  .strict();

export const providerCredentialTestResponseSchema = z.object({
  status: z.literal("verified"),
  lastVerifiedAt: z.string().datetime(),
  verification: providerVerificationMetadataSchema,
});

export const modelCapabilitySchema = z.enum(["chat", "embeddings", "rerank"]);

export const providerModelResponseSchema = z.object({
  id: z.string().min(1),
  provider: z.literal("aitunnel"),
  capability: modelCapabilitySchema,
  upstreamProvider: z.string().nullable(),
  description: z.string().nullable(),
  inputModalities: z.array(z.string()),
  outputModalities: z.array(z.string()),
  contextSize: z.number().int().positive().nullable(),
  maxOutput: z.number().int().positive().nullable(),
  maxTokens: z.number().int().positive().nullable(),
  pricing: z.record(z.string(), z.number()),
  available: z.boolean(),
  fetchedAt: z.string().datetime(),
});

export const modelCatalogResponseSchema = z.object({
  models: z.array(providerModelResponseSchema),
  lastSyncedAt: z.string().datetime().nullable(),
});

export const syncModelsRequestSchema = z.object({ projectId: z.string().uuid() }).strict();

export const syncModelsResponseSchema = z.object({
  counts: z.object({
    chat: z.number().int().nonnegative(),
    embeddings: z.number().int().nonnegative(),
    rerank: z.number().int().nonnegative(),
  }),
  syncedAt: z.string().datetime(),
});

export const projectModelSettingsResponseSchema = z.object({
  projectId: z.string().uuid(),
  chatModelId: z.string().nullable(),
  embeddingModelId: z.string().nullable(),
  rerankModelId: z.string().nullable(),
  embeddingDimension: z.number().int().positive().nullable(),
  maxOutputTokens: z.number().int().min(1).max(64_000),
  temperature: z.number().min(0).max(2).nullable(),
  updatedAt: z.string().datetime().nullable(),
});

export const updateProjectModelSettingsRequestSchema = z
  .object({
    chatModelId: z.string().min(1).max(255).nullable().optional(),
    embeddingModelId: z.string().min(1).max(255).nullable().optional(),
    rerankModelId: z.string().min(1).max(255).nullable().optional(),
    maxOutputTokens: z.number().int().min(1).max(64_000).optional(),
    temperature: z.number().min(0).max(2).nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: "Укажите хотя бы одно поле" });

export type ProviderCredentialStatus = z.infer<typeof providerCredentialStatusSchema>;
export type ProviderVerificationMetadata = z.infer<typeof providerVerificationMetadataSchema>;
export type ProviderCredentialResponse = z.infer<typeof providerCredentialResponseSchema>;
export type ProviderStateResponse = z.infer<typeof providerStateResponseSchema>;
export type SaveProviderCredentialRequest = z.infer<typeof saveProviderCredentialRequestSchema>;
export type ProviderCredentialTestResponse = z.infer<typeof providerCredentialTestResponseSchema>;
export type ModelCapability = z.infer<typeof modelCapabilitySchema>;
export type ProviderModelResponse = z.infer<typeof providerModelResponseSchema>;
export type ModelCatalogResponse = z.infer<typeof modelCatalogResponseSchema>;
export type SyncModelsRequest = z.infer<typeof syncModelsRequestSchema>;
export type SyncModelsResponse = z.infer<typeof syncModelsResponseSchema>;
export type ProjectModelSettingsResponse = z.infer<typeof projectModelSettingsResponseSchema>;
export type UpdateProjectModelSettingsRequest = z.infer<
  typeof updateProjectModelSettingsRequestSchema
>;
