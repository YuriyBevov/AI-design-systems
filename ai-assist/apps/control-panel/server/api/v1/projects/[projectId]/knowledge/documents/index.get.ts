import { knowledgeDocumentListResponseSchema } from "@ai-assist/contracts";

import { getKnowledgeDocuments } from "../../../../../../services/knowledge";

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, "projectId");
  if (!projectId)
    throw createError({ statusCode: 400, statusMessage: "Не указан идентификатор проекта" });
  return knowledgeDocumentListResponseSchema.parse(await getKnowledgeDocuments(event, projectId));
});
