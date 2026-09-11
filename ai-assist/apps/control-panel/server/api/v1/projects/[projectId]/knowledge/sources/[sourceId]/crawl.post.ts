import { requestKnowledgeCrawlResponseSchema } from "@ai-assist/contracts";

import { requestKnowledgeCrawl } from "../../../../../../../services/crawler";

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, "projectId");
  const sourceId = getRouterParam(event, "sourceId");
  if (!projectId || !sourceId) {
    throw createError({
      statusCode: 400,
      statusMessage: "Не указаны идентификаторы проекта и источника",
    });
  }
  const response = requestKnowledgeCrawlResponseSchema.parse(
    await requestKnowledgeCrawl(event, projectId, sourceId),
  );
  setResponseStatus(event, 202);
  return response;
});
