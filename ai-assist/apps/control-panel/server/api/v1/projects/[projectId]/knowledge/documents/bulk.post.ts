import {
  bulkKnowledgeDocumentsRequestSchema,
  bulkKnowledgeDocumentsResponseSchema,
} from "@ai-assist/contracts";

import { bulkMutateKnowledgeDocuments } from "../../../../../../services/knowledge-processing";

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, "projectId");
  if (!projectId) {
    throw createError({ statusCode: 400, statusMessage: "Не указан идентификатор проекта" });
  }
  const parsed = bulkKnowledgeDocumentsRequestSchema.safeParse(await readBody(event));
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: "Некорректное массовое действие" });
  }
  return bulkKnowledgeDocumentsResponseSchema.parse(
    await bulkMutateKnowledgeDocuments(event, projectId, parsed.data),
  );
});
