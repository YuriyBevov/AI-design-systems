import { z } from "zod";

import { assistantConfigSnapshotSchema } from "./assistant.js";
import { knowledgeRetrievalSourceSchema } from "./knowledge.js";

export const promptTypeSchema = z.literal("system");
export const promptStatusSchema = z.enum(["draft", "published", "archived"]);

const promptContentSchema = z
  .string()
  .min(1)
  .max(50_000)
  .refine((content) => content.trim().length > 0, { message: "Укажите текст роли ассистента" });

export const promptTemplateValidationSchema = z.object({
  variables: z.array(z.string().min(1).max(100)),
  unknownVariables: z.array(z.string().min(1).max(100)),
  malformedTemplate: z.boolean(),
  isPublishable: z.boolean(),
});

export const promptRevisionResponseSchema = z.object({
  id: z.string().uuid(),
  promptId: z.string().uuid(),
  revisionNo: z.number().int().positive(),
  content: promptContentSchema,
  contentChecksum: z.string().length(64),
  validation: promptTemplateValidationSchema,
  createdByEmail: z.string().email().nullable(),
  createdAt: z.string().datetime(),
});

export const promptSummaryResponseSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  type: promptTypeSchema,
  name: z.string().min(1).max(160),
  description: z.string().max(2_000).nullable(),
  status: promptStatusSchema,
  version: z.number().int().positive(),
  latestRevisionNo: z.number().int().nonnegative(),
  publishedRevisionNo: z.number().int().positive().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const promptModelSettingsSnapshotSchema = z.object({
  chatModelId: z.string().nullable(),
  embeddingModelId: z.string().nullable(),
  rerankModelId: z.string().nullable(),
  maxOutputTokens: z.number().int().positive(),
  temperature: z.number().min(0).max(2).nullable(),
});

export const promptPublicationResponseSchema = z.object({
  id: z.string().uuid(),
  assistantId: z.string().uuid(),
  promptId: z.string().uuid(),
  promptRevisionId: z.string().uuid(),
  configRevisionId: z.string().uuid(),
  revisionNo: z.number().int().positive(),
  supersedesId: z.string().uuid().nullable(),
  assistantConfig: assistantConfigSnapshotSchema,
  modelSettings: promptModelSettingsSnapshotSchema,
  publishedByEmail: z.string().email().nullable(),
  publishedAt: z.string().datetime(),
});

export const promptDetailResponseSchema = z.object({
  prompt: promptSummaryResponseSchema,
  revisions: z.array(promptRevisionResponseSchema),
  activePublication: promptPublicationResponseSchema.nullable(),
});

export const promptListResponseSchema = z.object({
  prompts: z.array(promptSummaryResponseSchema),
  activePublication: promptPublicationResponseSchema.nullable(),
});

export const publishedPromptResponseSchema = z.object({
  assistantId: z.string().uuid(),
  assistantPublicId: z.string().min(1).max(80),
  publicationId: z.string().uuid(),
  promptId: z.string().uuid(),
  promptRevisionId: z.string().uuid(),
  configRevisionId: z.string().uuid(),
  revisionNo: z.number().int().positive(),
  content: promptContentSchema,
  variables: z.array(z.string()),
  assistantConfig: assistantConfigSnapshotSchema,
  modelSettings: promptModelSettingsSnapshotSchema,
  publishedAt: z.string().datetime(),
});

export const createPromptRequestSchema = z
  .object({
    type: promptTypeSchema.default("system"),
    name: z.string().trim().min(1).max(160),
    description: z.string().trim().max(2_000).nullable().default(null),
    content: promptContentSchema,
  })
  .strict();

export const updatePromptRequestSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    name: z.string().trim().min(1).max(160).optional(),
    description: z.string().trim().max(2_000).nullable().optional(),
  })
  .strict()
  .refine((value) => value.name !== undefined || value.description !== undefined, {
    message: "Укажите хотя бы одно поле роли ассистента",
  });

export const createPromptRevisionRequestSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    content: promptContentSchema,
  })
  .strict();

export const publishPromptRequestSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    revisionId: z.string().uuid(),
  })
  .strict();

export const promptPreviewRequestSchema = z
  .object({
    revisionId: z.string().uuid(),
    question: z.string().trim().min(1).max(4_000),
  })
  .strict();

export const promptPreviewResponseSchema = z.object({
  promptId: z.string().uuid(),
  promptRevisionId: z.string().uuid(),
  promptRevisionNo: z.number().int().positive(),
  configRevisionId: z.string().uuid(),
  configRevisionNo: z.number().int().positive(),
  answer: z.string().min(1).max(262_144),
  model: z.object({
    requestedId: z.string().min(1).max(255),
    resolvedId: z.string().min(1).max(255).nullable(),
    maxOutputTokens: z.number().int().positive(),
    temperature: z.number().min(0).max(2).nullable(),
  }),
  finishReason: z.string().max(100).nullable(),
  usage: z.object({
    inputTokens: z.number().int().nonnegative().nullable(),
    outputTokens: z.number().int().nonnegative().nullable(),
  }),
  latencyMs: z.number().int().nonnegative(),
  retrieval: z.object({
    status: z.enum(["ready", "empty"]),
    mode: z.enum(["hybrid", "lexical"]),
    indexVersionId: z.string().uuid().nullable(),
    warningCode: z.string().min(1).max(100).nullable(),
    sources: z.array(knowledgeRetrievalSourceSchema).max(5),
  }),
});

export const archivePromptRequestSchema = z
  .object({ expectedVersion: z.number().int().positive() })
  .strict();

export const deletePromptQuerySchema = z
  .object({ expectedVersion: z.coerce.number().int().positive() })
  .strict();

export const deletePromptResponseSchema = z.object({
  id: z.string().uuid(),
  deleted: z.literal(true),
});

export type PromptType = z.infer<typeof promptTypeSchema>;
export type PromptStatus = z.infer<typeof promptStatusSchema>;
export type PromptTemplateValidation = z.infer<typeof promptTemplateValidationSchema>;
export type PromptRevisionResponse = z.infer<typeof promptRevisionResponseSchema>;
export type PromptSummaryResponse = z.infer<typeof promptSummaryResponseSchema>;
export type PromptModelSettingsSnapshot = z.infer<typeof promptModelSettingsSnapshotSchema>;
export type PromptPublicationResponse = z.infer<typeof promptPublicationResponseSchema>;
export type PromptDetailResponse = z.infer<typeof promptDetailResponseSchema>;
export type PromptListResponse = z.infer<typeof promptListResponseSchema>;
export type PublishedPromptResponse = z.infer<typeof publishedPromptResponseSchema>;
export type DeletePromptResponse = z.infer<typeof deletePromptResponseSchema>;
export type CreatePromptRequest = z.infer<typeof createPromptRequestSchema>;
export type UpdatePromptRequest = z.infer<typeof updatePromptRequestSchema>;
export type CreatePromptRevisionRequest = z.infer<typeof createPromptRevisionRequestSchema>;
export type PublishPromptRequest = z.infer<typeof publishPromptRequestSchema>;
export type PromptPreviewRequest = z.infer<typeof promptPreviewRequestSchema>;
export type PromptPreviewResponse = z.infer<typeof promptPreviewResponseSchema>;
export type ArchivePromptRequest = z.infer<typeof archivePromptRequestSchema>;
