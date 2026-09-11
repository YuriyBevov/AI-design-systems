import { knowledgeDocumentDetailResponseSchema } from "@ai-assist/contracts";

import { getKnowledgeDocument } from "../../../../../../../services/knowledge";

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, "projectId");
  const documentId = getRouterParam(event, "documentId");
  if (!projectId || !documentId) {
    throw createError({
      statusCode: 400,
      statusMessage: "Не указаны идентификаторы проекта и записи",
    });
  }
  return knowledgeDocumentDetailResponseSchema.parse(
    await getKnowledgeDocument(event, projectId, documentId),
  );
});
