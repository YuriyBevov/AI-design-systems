import { requestKnowledgeCrawlResponseSchema } from "@ai-assist/contracts";

import { requestKnowledgeCrawlPageRetry } from "../../../../../../../../../services/crawler";

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, "projectId");
  const runId = getRouterParam(event, "runId");
  const pageId = getRouterParam(event, "pageId");
  if (!projectId || !runId || !pageId) {
    throw createError({
      statusCode: 400,
      statusMessage: "Не указаны идентификаторы проекта, задания или страницы",
    });
  }
  const response = requestKnowledgeCrawlResponseSchema.parse(
    await requestKnowledgeCrawlPageRetry(event, projectId, runId, pageId),
  );
  setResponseStatus(event, 202);
  return response;
});
