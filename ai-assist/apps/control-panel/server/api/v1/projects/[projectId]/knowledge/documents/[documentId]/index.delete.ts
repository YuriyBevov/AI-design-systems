import {
  deleteKnowledgeDocumentQuerySchema,
  deleteKnowledgeDocumentResponseSchema,
} from "@ai-assist/contracts";

import { deleteKnowledgeDocument } from "../../../../../../../services/knowledge";

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, "projectId");
  const documentId = getRouterParam(event, "documentId");
  if (!projectId || !documentId) {
    throw createError({
      statusCode: 400,
      statusMessage: "Не указаны идентификаторы проекта и записи",
    });
  }
  const parsed = deleteKnowledgeDocumentQuerySchema.safeParse(getQuery(event));
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: "Некорректный запрос удаления записи" });
  }
  return deleteKnowledgeDocumentResponseSchema.parse(
    await deleteKnowledgeDocument(event, projectId, documentId, parsed.data.expectedVersion),
  );
});
