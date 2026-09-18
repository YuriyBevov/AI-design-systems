import { deleteKnowledgeProcessingRunResponseSchema } from "@ai-assist/contracts";

import { deleteKnowledgeProcessingRun } from "../../../../../../../services/knowledge-processing";

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, "projectId");
  const runId = getRouterParam(event, "runId");
  if (!projectId || !runId) {
    throw createError({
      statusCode: 400,
      statusMessage: "Не указаны идентификаторы проекта и запуска постобработки",
    });
  }
  return deleteKnowledgeProcessingRunResponseSchema.parse(
    await deleteKnowledgeProcessingRun(event, projectId, runId),
  );
});
