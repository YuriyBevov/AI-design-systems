import {
  knowledgeDocumentDetailResponseSchema,
  mutateKnowledgeDocumentRequestSchema,
} from "@ai-assist/contracts";

import { archiveKnowledgeDocument } from "../../../../../../../services/knowledge";

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, "projectId");
  const documentId = getRouterParam(event, "documentId");
  if (!projectId || !documentId) {
    throw createError({
      statusCode: 400,
      statusMessage: "Не указаны идентификаторы проекта и записи",
    });
  }
  const parsed = mutateKnowledgeDocumentRequestSchema.safeParse(await readBody(event));
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: "Некорректный запрос архивации записи" });
  }
  return knowledgeDocumentDetailResponseSchema.parse(
    await archiveKnowledgeDocument(event, projectId, documentId, parsed.data),
  );
});
