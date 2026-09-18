import { deleteKnowledgeCrawlResponseSchema } from "@ai-assist/contracts";

import { deleteKnowledgeCrawl } from "../../../../../../../services/crawler";

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, "projectId");
  const runId = getRouterParam(event, "runId");
  if (!projectId || !runId) {
    throw createError({
      statusCode: 400,
      statusMessage: "Не указаны идентификаторы проекта и задания",
    });
  }
  return deleteKnowledgeCrawlResponseSchema.parse(
    await deleteKnowledgeCrawl(event, projectId, runId),
  );
});
