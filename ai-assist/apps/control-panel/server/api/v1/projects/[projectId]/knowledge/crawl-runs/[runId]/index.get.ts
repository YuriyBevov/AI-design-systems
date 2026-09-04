import { crawlRunDetailResponseSchema, crawlRunPagesQuerySchema } from "@ai-assist/contracts";

import { getKnowledgeCrawlRun } from "../../../../../../../services/crawler";

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, "projectId");
  const runId = getRouterParam(event, "runId");
  if (!projectId || !runId) {
    throw createError({ statusCode: 400, statusMessage: "Project and run ids are required" });
  }
  const query = crawlRunPagesQuerySchema.safeParse(getQuery(event));
  if (!query.success) {
    throw createError({ statusCode: 400, statusMessage: "Invalid crawl page query" });
  }
  return crawlRunDetailResponseSchema.parse(
    await getKnowledgeCrawlRun(event, projectId, runId, query.data),
  );
});
