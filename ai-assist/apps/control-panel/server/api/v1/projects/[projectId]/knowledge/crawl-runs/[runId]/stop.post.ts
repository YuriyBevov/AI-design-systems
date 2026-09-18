import { crawlRunResponseSchema } from "@ai-assist/contracts";

import { stopKnowledgeCrawl } from "../../../../../../../services/crawler";

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, "projectId");
  const runId = getRouterParam(event, "runId");
  if (!projectId || !runId) {
    throw createError({
      statusCode: 400,
      statusMessage: "Не указаны идентификаторы проекта и задания",
    });
  }
  return crawlRunResponseSchema.parse(await stopKnowledgeCrawl(event, projectId, runId));
});
