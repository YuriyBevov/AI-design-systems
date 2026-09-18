import { requestKnowledgeProcessingResponseSchema } from "@ai-assist/contracts";

import { retryFailedKnowledgeProcessing } from "../../../../../../../services/knowledge-processing";

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, "projectId");
  const runId = getRouterParam(event, "runId");
  if (!projectId || !runId) {
    throw createError({
      statusCode: 400,
      statusMessage: "Не указаны идентификаторы проекта и запуска постобработки",
    });
  }
  const response = requestKnowledgeProcessingResponseSchema.parse(
    await retryFailedKnowledgeProcessing(event, projectId, runId),
  );
  setResponseStatus(event, 202);
  return response;
});
