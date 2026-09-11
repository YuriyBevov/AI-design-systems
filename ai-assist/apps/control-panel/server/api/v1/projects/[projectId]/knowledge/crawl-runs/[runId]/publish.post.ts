import { publishCrawlRunRequestSchema, publishCrawlRunResponseSchema } from "@ai-assist/contracts";

import { publishKnowledgeCrawlRun } from "../../../../../../../services/crawler";

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, "projectId");
  const runId = getRouterParam(event, "runId");
  if (!projectId || !runId) {
    throw createError({
      statusCode: 400,
      statusMessage: "Не указаны идентификаторы проекта и задания парсинга",
    });
  }
  const parsed = publishCrawlRunRequestSchema.safeParse((await readBody(event)) ?? {});
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: "Некорректный запрос публикации результатов парсинга",
    });
  }
  return publishCrawlRunResponseSchema.parse(
    await publishKnowledgeCrawlRun(event, projectId, runId, parsed.data),
  );
});
