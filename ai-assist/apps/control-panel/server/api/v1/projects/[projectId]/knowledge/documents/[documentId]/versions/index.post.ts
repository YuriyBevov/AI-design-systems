import {
  createKnowledgeDocumentVersionRequestSchema,
  knowledgeDocumentDetailResponseSchema,
} from "@ai-assist/contracts";

import { createKnowledgeDocumentVersion } from "../../../../../../../../services/knowledge";

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, "projectId");
  const documentId = getRouterParam(event, "documentId");
  if (!projectId || !documentId) {
    throw createError({
      statusCode: 400,
      statusMessage: "Не указаны идентификаторы проекта и записи",
    });
  }
  const parsed = createKnowledgeDocumentVersionRequestSchema.safeParse(await readBody(event));
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: "Некорректные данные версии записи" });
  }
  return knowledgeDocumentDetailResponseSchema.parse(
    await createKnowledgeDocumentVersion(event, projectId, documentId, parsed.data),
  );
});
