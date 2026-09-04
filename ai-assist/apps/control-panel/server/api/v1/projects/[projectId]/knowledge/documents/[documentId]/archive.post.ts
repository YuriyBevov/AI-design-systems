import {
  knowledgeDocumentDetailResponseSchema,
  mutateKnowledgeDocumentRequestSchema,
} from "@ai-assist/contracts";

import { archiveKnowledgeDocument } from "../../../../../../../services/knowledge";

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, "projectId");
  const documentId = getRouterParam(event, "documentId");
  if (!projectId || !documentId) {
    throw createError({ statusCode: 400, statusMessage: "Project and document ids are required" });
  }
  const parsed = mutateKnowledgeDocumentRequestSchema.safeParse(await readBody(event));
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: "Invalid knowledge archive request" });
  }
  return knowledgeDocumentDetailResponseSchema.parse(
    await archiveKnowledgeDocument(event, projectId, documentId, parsed.data),
  );
});
