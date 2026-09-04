import {
  knowledgeDocumentDetailResponseSchema,
  mutateKnowledgeDocumentRequestSchema,
} from "@ai-assist/contracts";

import { unpublishKnowledgeDocument } from "../../../../../../../services/knowledge";

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, "projectId");
  const documentId = getRouterParam(event, "documentId");
  if (!projectId || !documentId) {
    throw createError({ statusCode: 400, statusMessage: "Project and document ids are required" });
  }
  const parsed = mutateKnowledgeDocumentRequestSchema.safeParse(await readBody(event));
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: "Invalid knowledge unpublish request" });
  }
  return knowledgeDocumentDetailResponseSchema.parse(
    await unpublishKnowledgeDocument(event, projectId, documentId, parsed.data),
  );
});
