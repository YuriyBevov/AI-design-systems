import {
  createKnowledgeDocumentVersionRequestSchema,
  knowledgeDocumentDetailResponseSchema,
} from "@ai-assist/contracts";

import { createKnowledgeDocumentVersion } from "../../../../../../../../services/knowledge";

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, "projectId");
  const documentId = getRouterParam(event, "documentId");
  if (!projectId || !documentId) {
    throw createError({ statusCode: 400, statusMessage: "Project and document ids are required" });
  }
  const parsed = createKnowledgeDocumentVersionRequestSchema.safeParse(await readBody(event));
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: "Invalid knowledge version request" });
  }
  return knowledgeDocumentDetailResponseSchema.parse(
    await createKnowledgeDocumentVersion(event, projectId, documentId, parsed.data),
  );
});
