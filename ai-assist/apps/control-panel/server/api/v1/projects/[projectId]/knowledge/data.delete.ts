import {
  clearKnowledgeDataRequestSchema,
  clearKnowledgeDataResponseSchema,
} from "@ai-assist/contracts";

import { clearKnowledgeData } from "../../../../../services/knowledge-data";

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, "projectId");
  if (!projectId) {
    throw createError({ statusCode: 400, statusMessage: "Не указан идентификатор проекта" });
  }
  const parsed = clearKnowledgeDataRequestSchema.safeParse(await readBody(event));
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: "Некорректные параметры очистки" });
  }
  return clearKnowledgeDataResponseSchema.parse(
    await clearKnowledgeData(event, projectId, parsed.data),
  );
});
