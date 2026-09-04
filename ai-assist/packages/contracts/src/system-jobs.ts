import { z } from "zod";

export const systemQueueName = "ai-assist-system";
export const systemPingJobName = "system.ping";
export const knowledgeIndexJobName = "knowledge.index";
export const knowledgeCrawlJobName = "knowledge.crawl";

export const systemPingJobDataSchema = z.object({
  requestedAt: z.string().datetime(),
  requestId: z.string().min(1).max(128),
});

export const systemPingJobResultSchema = z.object({
  respondedAt: z.string().datetime(),
  workerId: z.string().min(1),
});

export const knowledgeIndexJobDataSchema = z
  .object({
    projectId: z.string().uuid(),
    indexVersionId: z.string().uuid(),
    requestedAt: z.string().datetime(),
    requestId: z.string().min(1).max(128),
  })
  .strict();

export const knowledgeIndexJobResultSchema = z.object({
  indexVersionId: z.string().uuid(),
  projectId: z.string().uuid(),
  status: z.literal("active"),
  documentCount: z.number().int().nonnegative(),
  chunkCount: z.number().int().nonnegative(),
  embeddingDimension: z.number().int().positive(),
  inputTokens: z.number().int().nonnegative().nullable(),
});

export type SystemPingJobData = z.infer<typeof systemPingJobDataSchema>;
export type SystemPingJobResult = z.infer<typeof systemPingJobResultSchema>;
export type KnowledgeIndexJobData = z.infer<typeof knowledgeIndexJobDataSchema>;
export type KnowledgeIndexJobResult = z.infer<typeof knowledgeIndexJobResultSchema>;
