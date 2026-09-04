import { publishCrawlRunRequestSchema, publishCrawlRunResponseSchema } from "@ai-assist/contracts";

import { publishKnowledgeCrawlRun } from "../../../../../../../services/crawler";

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, "projectId");
  const runId = getRouterParam(event, "runId");
  if (!projectId || !runId) {
    throw createError({ statusCode: 400, statusMessage: "Project and run ids are required" });
  }
  const parsed = publishCrawlRunRequestSchema.safeParse((await readBody(event)) ?? {});
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: "Invalid crawl publication request" });
  }
  return publishCrawlRunResponseSchema.parse(
    await publishKnowledgeCrawlRun(event, projectId, runId, parsed.data),
  );
});
