import { controlKnowledgeCrawlRequestSchema, crawlRunResponseSchema } from "@ai-assist/contracts";

import { controlKnowledgeCrawl } from "../../../../../../../services/crawler";

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, "projectId");
  const runId = getRouterParam(event, "runId");
  if (!projectId || !runId) {
    throw createError({
      statusCode: 400,
      statusMessage: "Не указаны идентификаторы проекта и задания",
    });
  }
  const parsed = controlKnowledgeCrawlRequestSchema.safeParse(await readBody(event));
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: "Некорректное состояние парсинга" });
  }
  return crawlRunResponseSchema.parse(
    await controlKnowledgeCrawl(event, projectId, runId, parsed.data),
  );
});
