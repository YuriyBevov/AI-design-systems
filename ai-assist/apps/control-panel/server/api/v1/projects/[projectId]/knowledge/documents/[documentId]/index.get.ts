import { knowledgeDocumentDetailResponseSchema } from "@ai-assist/contracts";

import { getKnowledgeDocument } from "../../../../../../../services/knowledge";

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, "projectId");
  const documentId = getRouterParam(event, "documentId");
  if (!projectId || !documentId) {
    throw createError({ statusCode: 400, statusMessage: "Project and document ids are required" });
  }
  return knowledgeDocumentDetailResponseSchema.parse(
    await getKnowledgeDocument(event, projectId, documentId),
  );
});
