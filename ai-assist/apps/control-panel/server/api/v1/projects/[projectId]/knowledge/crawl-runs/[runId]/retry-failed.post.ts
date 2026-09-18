import { requestKnowledgeCrawlResponseSchema } from "@ai-assist/contracts";

import { requestFailedKnowledgeCrawlPagesRetry } from "../../../../../../../services/crawler";

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, "projectId");
  const runId = getRouterParam(event, "runId");
  if (!projectId || !runId) {
    throw createError({
      statusCode: 400,
      statusMessage: "Не указаны идентификаторы проекта или задания",
    });
  }
  const response = requestKnowledgeCrawlResponseSchema.parse(
    await requestFailedKnowledgeCrawlPagesRetry(event, projectId, runId),
  );
  setResponseStatus(event, 202);
  return response;
});
