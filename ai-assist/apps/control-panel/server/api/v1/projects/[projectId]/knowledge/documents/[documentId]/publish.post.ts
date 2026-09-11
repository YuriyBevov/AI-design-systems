import {
  knowledgeDocumentDetailResponseSchema,
  publishKnowledgeDocumentRequestSchema,
} from "@ai-assist/contracts";

import { publishKnowledgeDocument } from "../../../../../../../services/knowledge";

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, "projectId");
  const documentId = getRouterParam(event, "documentId");
  if (!projectId || !documentId) {
    throw createError({
      statusCode: 400,
      statusMessage: "Не указаны идентификаторы проекта и записи",
    });
  }
  const parsed = publishKnowledgeDocumentRequestSchema.safeParse(await readBody(event));
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: "Некорректный запрос публикации записи" });
  }
  return knowledgeDocumentDetailResponseSchema.parse(
    await publishKnowledgeDocument(event, projectId, documentId, parsed.data),
  );
});
