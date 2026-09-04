import { z } from "zod";

export const crawlRunStatusSchema = z.enum([
  "queued",
  "running",
  "succeeded",
  "partial",
  "failed",
  "cancelled",
]);
export const crawlPageStatusSchema = z.enum(["succeeded", "failed", "skipped"]);
export const crawlChangeTypeSchema = z.enum(["new", "changed", "unchanged"]);
export const crawlReviewStatusSchema = z.enum(["pending", "approved", "rejected"]);

const publicSourceUrlSchema = z
  .string()
  .trim()
  .url()
  .max(2_048)
  .superRefine((value, context) => {
    const url = new URL(value);
    if (!(["http:", "https:"] as string[]).includes(url.protocol)) {
      context.addIssue({ code: "custom", message: "Only HTTP(S) source URLs are allowed" });
    }
    if (url.username || url.password || url.hash) {
      context.addIssue({ code: "custom", message: "URL credentials and fragments are forbidden" });
    }
  });

const pathPrefixSchema = z
  .string()
  .trim()
  .min(1)
  .max(300)
  .refine((value) => value.startsWith("/"), "Path prefix must start with /");

export const urlKnowledgeSourceSettingsSchema = z
  .object({
    startUrl: publicSourceUrlSchema,
    crawlMode: z.enum(["limited", "full"]).default("limited"),
    includePathPrefixes: z.array(pathPrefixSchema).max(100).default(["/"]),
    includeExactPaths: z.array(pathPrefixSchema).max(100).default([]),
    excludePathPrefixes: z
      .array(pathPrefixSchema)
      .max(30)
      .default(["/bitrix/", "/basket/", "/search/", "/auth/", "/personal/"]),
    maxPages: z.number().int().min(1).max(5_000).default(25),
    maxDepth: z.number().int().min(0).max(5).default(2),
    requestDelayMs: z.number().int().min(250).max(5_000).default(500),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.includePathPrefixes.length + value.includeExactPaths.length === 0) {
      context.addIssue({
        code: "custom",
        message: "At least one exact path or path prefix must be included",
      });
    }
    if (value.crawlMode === "limited" && value.maxPages > 100) {
      context.addIssue({
        code: "custom",
        path: ["maxPages"],
        message: "Limited crawl cannot process more than 100 pages",
      });
    }
  });

export const discoverSiteStructureRequestSchema = z
  .object({ startUrl: publicSourceUrlSchema })
  .strict();

export const siteStructureSectionSchema = z.object({
  path: pathPrefixSchema,
  url: publicSourceUrlSchema,
  label: z.string().trim().min(1).max(160),
  descendantCount: z.number().int().nonnegative(),
  source: z.enum(["sitemap", "navigation", "both"]),
});

export const discoverSiteStructureResponseSchema = z.object({
  origin: z.string().url(),
  method: z.enum(["sitemap", "navigation", "mixed"]),
  sections: z.array(siteStructureSectionSchema).max(100),
});

export const createUrlKnowledgeSourceRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    settings: urlKnowledgeSourceSettingsSchema,
  })
  .strict();

export const updateUrlKnowledgeSourceRequestSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    name: z.string().trim().min(1).max(160),
    status: z.enum(["active", "archived"]),
    settings: urlKnowledgeSourceSettingsSchema,
  })
  .strict();

export const crawlRunResponseSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  sourceId: z.string().uuid(),
  status: crawlRunStatusSchema,
  discoveredCount: z.number().int().nonnegative(),
  processedCount: z.number().int().nonnegative(),
  succeededCount: z.number().int().nonnegative(),
  failedCount: z.number().int().nonnegative(),
  newCount: z.number().int().nonnegative(),
  changedCount: z.number().int().nonnegative(),
  unchangedCount: z.number().int().nonnegative(),
  approvedCount: z.number().int().nonnegative(),
  profileVersion: z.string().min(1).max(100),
  errorCode: z.string().min(1).max(100).nullable(),
  requestedByEmail: z.string().email().nullable(),
  requestId: z.string().min(1).max(128),
  startedAt: z.string().datetime().nullable(),
  finishedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const urlKnowledgeSourceResponseSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  type: z.literal("url"),
  name: z.string().min(1).max(160),
  status: z.enum(["active", "archived"]),
  version: z.number().int().positive(),
  settings: urlKnowledgeSourceSettingsSchema,
  lastCrawledAt: z.string().datetime().nullable(),
  lastSuccessfulCrawlAt: z.string().datetime().nullable(),
  lastErrorCode: z.string().min(1).max(100).nullable(),
  latestRun: crawlRunResponseSchema.nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const urlKnowledgeSourceListResponseSchema = z.object({
  sources: z.array(urlKnowledgeSourceResponseSchema),
});

export const crawlPageResponseSchema = z.object({
  id: z.string().uuid(),
  normalizedUrl: z.string().url().max(2_048),
  depth: z.number().int().nonnegative(),
  status: crawlPageStatusSchema,
  httpStatus: z.number().int().min(100).max(599).nullable(),
  contentType: z.string().max(255).nullable(),
  documentId: z.string().uuid().nullable(),
  documentVersionId: z.string().uuid().nullable(),
  changeType: crawlChangeTypeSchema.nullable(),
  documentType: z.enum(["page", "product"]).nullable(),
  title: z.string().min(1).max(500).nullable(),
  contentChecksum: z.string().length(64).nullable(),
  confidence: z.number().min(0).max(1).nullable(),
  warnings: z.array(z.string().min(1).max(100)),
  errorCode: z.string().min(1).max(100).nullable(),
  retryable: z.boolean(),
  reviewStatus: crawlReviewStatusSchema,
  contentPreview: z.string().max(1_000).nullable(),
  fetchedAt: z.string().datetime().nullable(),
});

export const crawlRunDetailResponseSchema = z.object({
  run: crawlRunResponseSchema,
  pages: z.array(crawlPageResponseSchema).max(100),
  pagination: z.object({
    page: z.number().int().positive(),
    pageSize: z.number().int().min(1).max(100),
    totalItems: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
  }),
});

export const crawlRunPagesQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

export const requestKnowledgeCrawlResponseSchema = z.object({
  jobId: z.string().min(1).max(255),
  run: crawlRunResponseSchema,
});

export const publishCrawlRunRequestSchema = z.discriminatedUnion("selection", [
  z
    .object({
      selection: z.literal("selected"),
      pageIds: z
        .array(z.string().uuid())
        .min(1)
        .max(100)
        .refine((ids) => new Set(ids).size === ids.length, "Page ids must be unique"),
    })
    .strict(),
  z
    .object({
      selection: z.literal("all"),
    })
    .strict(),
]);
export const publishCrawlRunResponseSchema = z.object({
  runId: z.string().uuid(),
  publishedCount: z.number().int().nonnegative(),
  skippedCount: z.number().int().nonnegative(),
  indexJobId: z.string().min(1).max(255).nullable(),
  indexWarning: z.string().min(1).max(100).nullable(),
});

export const knowledgeCrawlJobDataSchema = z
  .object({
    projectId: z.string().uuid(),
    sourceId: z.string().uuid(),
    runId: z.string().uuid(),
    requestedAt: z.string().datetime(),
    requestId: z.string().min(1).max(128),
  })
  .strict();

export const knowledgeCrawlJobResultSchema = z.object({
  runId: z.string().uuid(),
  projectId: z.string().uuid(),
  status: z.enum(["succeeded", "partial"]),
  processedCount: z.number().int().nonnegative(),
  succeededCount: z.number().int().nonnegative(),
  failedCount: z.number().int().nonnegative(),
});

export type CrawlRunStatus = z.infer<typeof crawlRunStatusSchema>;
export type CrawlPageStatus = z.infer<typeof crawlPageStatusSchema>;
export type CrawlChangeType = z.infer<typeof crawlChangeTypeSchema>;
export type CrawlReviewStatus = z.infer<typeof crawlReviewStatusSchema>;
export type UrlKnowledgeSourceSettings = z.infer<typeof urlKnowledgeSourceSettingsSchema>;
export type DiscoverSiteStructureRequest = z.infer<typeof discoverSiteStructureRequestSchema>;
export type SiteStructureSection = z.infer<typeof siteStructureSectionSchema>;
export type DiscoverSiteStructureResponse = z.infer<typeof discoverSiteStructureResponseSchema>;
export type CreateUrlKnowledgeSourceRequest = z.infer<typeof createUrlKnowledgeSourceRequestSchema>;
export type UpdateUrlKnowledgeSourceRequest = z.infer<typeof updateUrlKnowledgeSourceRequestSchema>;
export type CrawlRunResponse = z.infer<typeof crawlRunResponseSchema>;
export type UrlKnowledgeSourceResponse = z.infer<typeof urlKnowledgeSourceResponseSchema>;
export type UrlKnowledgeSourceListResponse = z.infer<typeof urlKnowledgeSourceListResponseSchema>;
export type CrawlPageResponse = z.infer<typeof crawlPageResponseSchema>;
export type CrawlRunDetailResponse = z.infer<typeof crawlRunDetailResponseSchema>;
export type CrawlRunPagesQuery = z.infer<typeof crawlRunPagesQuerySchema>;
export type RequestKnowledgeCrawlResponse = z.infer<typeof requestKnowledgeCrawlResponseSchema>;
export type PublishCrawlRunRequest = z.infer<typeof publishCrawlRunRequestSchema>;
export type PublishCrawlRunResponse = z.infer<typeof publishCrawlRunResponseSchema>;
export type KnowledgeCrawlJobData = z.infer<typeof knowledgeCrawlJobDataSchema>;
export type KnowledgeCrawlJobResult = z.infer<typeof knowledgeCrawlJobResultSchema>;
