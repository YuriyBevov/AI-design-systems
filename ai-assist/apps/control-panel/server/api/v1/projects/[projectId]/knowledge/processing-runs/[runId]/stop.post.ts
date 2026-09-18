import { knowledgeProcessingRunResponseSchema } from "@ai-assist/contracts";

import { stopKnowledgeProcessing } from "../../../../../../../services/knowledge-processing";

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, "projectId");
  const runId = getRouterParam(event, "runId");
  if (!projectId || !runId) {
    throw createError({
      statusCode: 400,
      statusMessage: "Не указаны идентификаторы проекта и запуска постобработки",
    });
  }
  return knowledgeProcessingRunResponseSchema.parse(
    await stopKnowledgeProcessing(event, projectId, runId),
  );
});
