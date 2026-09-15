import {
  reprocessKnowledgeCrawlRequestSchema,
  requestKnowledgeCrawlResponseSchema,
} from "@ai-assist/contracts";

import { requestKnowledgeCrawlReprocess } from "../../../../../../../services/crawler";

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, "projectId");
  const runId = getRouterParam(event, "runId");
  if (!projectId || !runId) {
    throw createError({
      statusCode: 400,
      statusMessage: "Не указаны идентификаторы проекта и задания",
    });
  }
  const parsed = reprocessKnowledgeCrawlRequestSchema.safeParse(await readBody(event));
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: "Некорректный промпт обработки страниц",
    });
  }
  const response = requestKnowledgeCrawlResponseSchema.parse(
    await requestKnowledgeCrawlReprocess(event, projectId, runId, parsed.data),
  );
  setResponseStatus(event, 202);
  return response;
});
