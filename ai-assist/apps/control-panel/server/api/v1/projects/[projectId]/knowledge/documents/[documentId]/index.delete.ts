import {
  deleteKnowledgeDocumentQuerySchema,
  deleteKnowledgeDocumentResponseSchema,
} from "@ai-assist/contracts";

import { deleteKnowledgeDocument } from "../../../../../../../services/knowledge";

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, "projectId");
  const documentId = getRouterParam(event, "documentId");
  if (!projectId || !documentId) {
    throw createError({ statusCode: 400, statusMessage: "Project and document ids are required" });
  }
  const parsed = deleteKnowledgeDocumentQuerySchema.safeParse(getQuery(event));
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: "Invalid knowledge delete request" });
  }
  return deleteKnowledgeDocumentResponseSchema.parse(
    await deleteKnowledgeDocument(event, projectId, documentId, parsed.data.expectedVersion),
  );
});
