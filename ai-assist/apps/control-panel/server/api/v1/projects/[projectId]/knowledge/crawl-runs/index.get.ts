import { crawlRunHistoryResponseSchema } from "@ai-assist/contracts";

import { getKnowledgeCrawlHistory } from "../../../../../../services/crawler";

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, "projectId");
  if (!projectId) {
    throw createError({ statusCode: 400, statusMessage: "Не указан идентификатор проекта" });
  }
  return crawlRunHistoryResponseSchema.parse(await getKnowledgeCrawlHistory(event, projectId));
});
