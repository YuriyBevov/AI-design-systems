import { knowledgeProcessingRunHistoryResponseSchema } from "@ai-assist/contracts";

import { getKnowledgeProcessingHistory } from "../../../../../../services/knowledge-processing";

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, "projectId");
  if (!projectId) {
    throw createError({ statusCode: 400, statusMessage: "Не указан идентификатор проекта" });
  }
  return knowledgeProcessingRunHistoryResponseSchema.parse(
    await getKnowledgeProcessingHistory(event, projectId),
  );
});
