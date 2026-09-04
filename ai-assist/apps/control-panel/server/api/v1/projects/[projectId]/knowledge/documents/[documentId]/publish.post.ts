import {
  knowledgeDocumentDetailResponseSchema,
  publishKnowledgeDocumentRequestSchema,
} from "@ai-assist/contracts";

import { publishKnowledgeDocument } from "../../../../../../../services/knowledge";

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, "projectId");
  const documentId = getRouterParam(event, "documentId");
  if (!projectId || !documentId) {
    throw createError({ statusCode: 400, statusMessage: "Project and document ids are required" });
  }
  const parsed = publishKnowledgeDocumentRequestSchema.safeParse(await readBody(event));
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: "Invalid knowledge publish request" });
  }
  return knowledgeDocumentDetailResponseSchema.parse(
    await publishKnowledgeDocument(event, projectId, documentId, parsed.data),
  );
});
