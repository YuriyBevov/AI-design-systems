import { z } from "zod";

export const knowledgeDocumentTypeSchema = z.enum(["page", "manual", "product", "service"]);
export const knowledgeDocumentStatusSchema = z.enum(["draft", "published", "archived"]);
export const knowledgeIndexStatusSchema = z.enum([
  "queued",
  "building",
  "active",
  "superseded",
  "failed",
]);

const canonicalUrlSchema = z
  .string()
  .trim()
  .url()
  .max(2_048)
  .nullable()
  .default(null)
  .superRefine((value, context) => {
    if (!value) return;
    const url = new URL(value);
    if (!(["http:", "https:"] as string[]).includes(url.protocol) || url.username || url.password) {
      context.addIssue({
        code: "custom",
        message: "Разрешены только публичные HTTP(S)-адреса источников",
      });
    }
  });

const tagsSchema = z
  .array(z.string().trim().min(1).max(64))
  .max(20)
  .default([])
  .transform((tags) => [...new Set(tags)]);

export const knowledgeProductInputSchema = z
  .object({
    externalId: z.string().trim().min(1).max(255).nullable().default(null),
    sku: z.string().trim().min(1).max(255).nullable().default(null),
    category: z.string().trim().min(1).max(500).nullable().default(null),
    priceDisplay: z.string().trim().min(1).max(255).nullable().default(null),
    priceAmount: z.number().nonnegative().max(1_000_000_000_000).nullable().default(null),
    currency: z.string().trim().length(3).toUpperCase().nullable().default(null),
    availability: z.string().trim().min(1).max(255).nullable().default(null),
    minimumOrder: z.number().nonnegative().max(1_000_000_000_000).nullable().default(null),
    characteristics: z
      .record(z.string().trim().min(1).max(160), z.string().trim().min(1).max(1_000))
      .default({}),
  })
  .strict();

const knowledgeContentFields = {
  title: z.string().trim().min(1).max(500),
  content: z
    .string()
    .min(1)
    .max(30_000)
    .refine((value) => value.trim().length > 0),
  canonicalUrl: canonicalUrlSchema,
  locale: z.string().trim().min(2).max(16).default("ru"),
  tags: tagsSchema,
};

export const createKnowledgeDocumentRequestSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("manual"),
      ...knowledgeContentFields,
      product: z.null().optional().default(null),
    })
    .strict(),
  z
    .object({
      type: z.literal("product"),
      ...knowledgeContentFields,
      product: knowledgeProductInputSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("service"),
      ...knowledgeContentFields,
      product: z.null().optional().default(null),
    })
    .strict(),
]);

export const createKnowledgeDocumentVersionRequestSchema = z.discriminatedUnion("type", [
  z
    .object({
      expectedVersion: z.number().int().positive(),
      type: z.literal("page"),
      ...knowledgeContentFields,
      product: z.null().optional().default(null),
    })
    .strict(),
  z
    .object({
      expectedVersion: z.number().int().positive(),
      type: z.literal("manual"),
      ...knowledgeContentFields,
      product: z.null().optional().default(null),
    })
    .strict(),
  z
    .object({
      expectedVersion: z.number().int().positive(),
      type: z.literal("product"),
      ...knowledgeContentFields,
      product: knowledgeProductInputSchema,
    })
    .strict(),
  z
    .object({
      expectedVersion: z.number().int().positive(),
      type: z.literal("service"),
      ...knowledgeContentFields,
      product: z.null().optional().default(null),
    })
    .strict(),
]);

export const publishKnowledgeDocumentRequestSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    versionId: z.string().uuid(),
  })
  .strict();

export const mutateKnowledgeDocumentRequestSchema = z
  .object({ expectedVersion: z.number().int().positive() })
  .strict();

export const deleteKnowledgeDocumentQuerySchema = z
  .object({ expectedVersion: z.coerce.number().int().positive() })
  .strict();

export const knowledgeProductResponseSchema = knowledgeProductInputSchema;

export const knowledgeDocumentVersionResponseSchema = z.object({
  id: z.string().uuid(),
  documentId: z.string().uuid(),
  versionNo: z.number().int().positive(),
  title: z.string().min(1).max(500),
  content: z.string().min(1).max(30_000),
  canonicalUrl: z.string().url().nullable(),
  locale: z.string().min(2).max(16),
  tags: z.array(z.string()),
  product: knowledgeProductResponseSchema.nullable(),
  contentChecksum: z.string().length(64),
  chunkCount: z.number().int().nonnegative(),
  createdByEmail: z.string().email().nullable(),
  createdAt: z.string().datetime(),
});

export const knowledgeDocumentSummaryResponseSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  type: knowledgeDocumentTypeSchema,
  status: knowledgeDocumentStatusSchema,
  version: z.number().int().positive(),
  title: z.string().min(1).max(500),
  locale: z.string().min(2).max(16),
  latestVersionNo: z.number().int().positive(),
  activeVersionId: z.string().uuid().nullable(),
  activeVersionNo: z.number().int().positive().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const knowledgeDocumentPublicationResponseSchema = z.object({
  id: z.string().uuid(),
  documentId: z.string().uuid(),
  documentVersionId: z.string().uuid(),
  versionNo: z.number().int().positive(),
  publishedByEmail: z.string().email().nullable(),
  publishedAt: z.string().datetime(),
});

export const knowledgeDocumentDetailResponseSchema = z.object({
  document: knowledgeDocumentSummaryResponseSchema,
  versions: z.array(knowledgeDocumentVersionResponseSchema),
  activePublication: knowledgeDocumentPublicationResponseSchema.nullable(),
});

export const knowledgeDocumentListResponseSchema = z.object({
  documents: z.array(knowledgeDocumentSummaryResponseSchema),
});

export const knowledgeIndexVersionResponseSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  status: knowledgeIndexStatusSchema,
  embeddingModelId: z.string().min(1).max(255),
  embeddingDimension: z.number().int().positive().nullable(),
  sourceFingerprint: z.string().length(64).nullable(),
  documentCount: z.number().int().nonnegative(),
  chunkCount: z.number().int().nonnegative(),
  inputTokens: z.number().int().nonnegative().nullable(),
  errorCode: z.string().min(1).max(100).nullable(),
  requestedByEmail: z.string().email().nullable(),
  requestId: z.string().min(1).max(128),
  startedAt: z.string().datetime().nullable(),
  finishedAt: z.string().datetime().nullable(),
  activatedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const knowledgeIndexStateResponseSchema = z.object({
  configuredEmbeddingModelId: z.string().min(1).max(255).nullable(),
  active: knowledgeIndexVersionResponseSchema.nullable(),
  latest: knowledgeIndexVersionResponseSchema.nullable(),
  stale: z.boolean(),
  publishedDocumentCount: z.number().int().nonnegative(),
  publishedChunkCount: z.number().int().nonnegative(),
});

export const requestKnowledgeReindexResponseSchema = z.object({
  jobId: z.string().min(1).max(255),
  index: knowledgeIndexVersionResponseSchema,
});

export const deleteKnowledgeDocumentResponseSchema = z.object({
  id: z.string().uuid(),
  deleted: z.literal(true),
});

export const bulkKnowledgeDocumentsRequestSchema = z
  .object({
    action: z.enum(["publish", "unpublish", "delete"]),
    documentIds: z.array(z.string().uuid()).min(1).max(5_000),
  })
  .strict()
  .transform((value) => ({ ...value, documentIds: [...new Set(value.documentIds)] }));

export const bulkKnowledgeDocumentsResponseSchema = z.object({
  action: z.enum(["publish", "unpublish", "delete"]),
  processedCount: z.number().int().nonnegative(),
  skippedCount: z.number().int().nonnegative(),
});

export const knowledgeProcessingRunStatusSchema = z.enum([
  "queued",
  "running",
  "succeeded",
  "partial",
  "failed",
  "cancelled",
]);

export const controlKnowledgeProcessingRequestSchema = z.object({ paused: z.boolean() }).strict();

const knowledgeProcessingSelectionSchema = z.discriminatedUnion("scope", [
  z.object({ scope: z.literal("all") }).strict(),
  z
    .object({
      scope: z.literal("selected"),
      documentIds: z.array(z.string().uuid()).min(1).max(5_000),
    })
    .strict()
    .transform((value) => ({ ...value, documentIds: [...new Set(value.documentIds)] })),
]);

export const requestKnowledgeProcessingSchema = z
  .object({
    instruction: z.string().trim().min(20).max(10_000),
    selection: knowledgeProcessingSelectionSchema,
  })
  .strict();

export const knowledgeProcessingRunResponseSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  status: knowledgeProcessingRunStatusSchema,
  instruction: z.string().min(20).max(10_000),
  totalCount: z.number().int().nonnegative(),
  processedCount: z.number().int().nonnegative(),
  succeededCount: z.number().int().nonnegative(),
  failedCount: z.number().int().nonnegative(),
  paused: z.boolean(),
  errorCode: z.string().min(1).max(100).nullable(),
  requestedByEmail: z.string().email().nullable(),
  requestId: z.string().min(1).max(128),
  startedAt: z.string().datetime().nullable(),
  finishedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const knowledgeProcessingRunHistoryResponseSchema = z.object({
  runs: z.array(knowledgeProcessingRunResponseSchema).max(5_000),
});

export const deleteKnowledgeProcessingRunResponseSchema = z.object({
  deleted: z.literal(true),
});

export const requestKnowledgeProcessingResponseSchema = z.object({
  jobId: z.string().min(1).max(255),
  run: knowledgeProcessingRunResponseSchema,
});

export const clearKnowledgeDataRequestSchema = z
  .object({
    scope: z.enum(["crawl_history", "documents", "sources", "all"]),
  })
  .strict();

export const clearKnowledgeDataResponseSchema = z.object({
  deletedCrawlRuns: z.number().int().nonnegative(),
  deletedDocuments: z.number().int().nonnegative(),
  deletedIndexVersions: z.number().int().nonnegative(),
  deletedSources: z.number().int().nonnegative(),
  preservedDocuments: z.number().int().nonnegative(),
});

export const knowledgeRetrievalSourceSchema = z.object({
  chunkId: z.string().uuid(),
  documentId: z.string().uuid(),
  documentVersionId: z.string().uuid(),
  title: z.string().min(1).max(500),
  canonicalUrl: z.string().url().nullable(),
  excerpt: z.string().min(1).max(2_000),
  score: z.number().min(0).max(1),
});

export type KnowledgeDocumentType = z.infer<typeof knowledgeDocumentTypeSchema>;
export type KnowledgeDocumentStatus = z.infer<typeof knowledgeDocumentStatusSchema>;
export type KnowledgeIndexStatus = z.infer<typeof knowledgeIndexStatusSchema>;
export type KnowledgeProductInput = z.infer<typeof knowledgeProductInputSchema>;
export type CreateKnowledgeDocumentRequest = z.infer<typeof createKnowledgeDocumentRequestSchema>;
export type CreateKnowledgeDocumentVersionRequest = z.infer<
  typeof createKnowledgeDocumentVersionRequestSchema
>;
export type PublishKnowledgeDocumentRequest = z.infer<typeof publishKnowledgeDocumentRequestSchema>;
export type MutateKnowledgeDocumentRequest = z.infer<typeof mutateKnowledgeDocumentRequestSchema>;
export type KnowledgeDocumentVersionResponse = z.infer<
  typeof knowledgeDocumentVersionResponseSchema
>;
export type KnowledgeDocumentSummaryResponse = z.infer<
  typeof knowledgeDocumentSummaryResponseSchema
>;
export type KnowledgeDocumentPublicationResponse = z.infer<
  typeof knowledgeDocumentPublicationResponseSchema
>;
export type KnowledgeDocumentDetailResponse = z.infer<typeof knowledgeDocumentDetailResponseSchema>;
export type KnowledgeDocumentListResponse = z.infer<typeof knowledgeDocumentListResponseSchema>;
export type KnowledgeIndexVersionResponse = z.infer<typeof knowledgeIndexVersionResponseSchema>;
export type KnowledgeIndexStateResponse = z.infer<typeof knowledgeIndexStateResponseSchema>;
export type RequestKnowledgeReindexResponse = z.infer<typeof requestKnowledgeReindexResponseSchema>;
export type DeleteKnowledgeDocumentResponse = z.infer<typeof deleteKnowledgeDocumentResponseSchema>;
export type BulkKnowledgeDocumentsRequest = z.infer<typeof bulkKnowledgeDocumentsRequestSchema>;
export type BulkKnowledgeDocumentsResponse = z.infer<typeof bulkKnowledgeDocumentsResponseSchema>;
export type KnowledgeProcessingRunStatus = z.infer<typeof knowledgeProcessingRunStatusSchema>;
export type ControlKnowledgeProcessingRequest = z.infer<
  typeof controlKnowledgeProcessingRequestSchema
>;
export type RequestKnowledgeProcessing = z.infer<typeof requestKnowledgeProcessingSchema>;
export type KnowledgeProcessingRunResponse = z.infer<typeof knowledgeProcessingRunResponseSchema>;
export type KnowledgeProcessingRunHistoryResponse = z.infer<
  typeof knowledgeProcessingRunHistoryResponseSchema
>;
export type DeleteKnowledgeProcessingRunResponse = z.infer<
  typeof deleteKnowledgeProcessingRunResponseSchema
>;
export type RequestKnowledgeProcessingResponse = z.infer<
  typeof requestKnowledgeProcessingResponseSchema
>;
export type ClearKnowledgeDataRequest = z.infer<typeof clearKnowledgeDataRequestSchema>;
export type ClearKnowledgeDataResponse = z.infer<typeof clearKnowledgeDataResponseSchema>;
export type KnowledgeRetrievalSource = z.infer<typeof knowledgeRetrievalSourceSchema>;
