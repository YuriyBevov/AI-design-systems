import { requestKnowledgeReindexResponseSchema } from "@ai-assist/contracts";

import { requestKnowledgeReindex } from "../../../../../services/knowledge";

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, "projectId");
  if (!projectId) {
    throw createError({ statusCode: 400, statusMessage: "Project ID is required" });
  }
  return requestKnowledgeReindexResponseSchema.parse(
    await requestKnowledgeReindex(event, projectId),
  );
});
