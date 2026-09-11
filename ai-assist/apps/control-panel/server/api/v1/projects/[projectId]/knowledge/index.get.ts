import { knowledgeIndexStateResponseSchema } from "@ai-assist/contracts";

import { getKnowledgeIndexState } from "../../../../../services/knowledge";

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, "projectId");
  if (!projectId) {
    throw createError({ statusCode: 400, statusMessage: "Не указан идентификатор проекта" });
  }
  return knowledgeIndexStateResponseSchema.parse(await getKnowledgeIndexState(event, projectId));
});
