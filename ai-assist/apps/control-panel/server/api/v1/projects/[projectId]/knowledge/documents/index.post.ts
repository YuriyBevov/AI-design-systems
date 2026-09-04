import {
  createKnowledgeDocumentRequestSchema,
  knowledgeDocumentDetailResponseSchema,
} from "@ai-assist/contracts";

import { createKnowledgeDocument } from "../../../../../../services/knowledge";

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, "projectId");
  if (!projectId) throw createError({ statusCode: 400, statusMessage: "Project id is required" });
  const parsed = createKnowledgeDocumentRequestSchema.safeParse(await readBody(event));
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: "Invalid knowledge document request" });
  }
  return knowledgeDocumentDetailResponseSchema.parse(
    await createKnowledgeDocument(event, projectId, parsed.data),
  );
});
