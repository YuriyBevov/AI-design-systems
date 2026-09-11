import { requestKnowledgeReindexResponseSchema } from "@ai-assist/contracts";

import { requestKnowledgeReindex } from "../../../../../services/knowledge";

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, "projectId");
  if (!projectId) {
    throw createError({ statusCode: 400, statusMessage: "Не указан идентификатор проекта" });
  }
  return requestKnowledgeReindexResponseSchema.parse(
    await requestKnowledgeReindex(event, projectId),
  );
});
