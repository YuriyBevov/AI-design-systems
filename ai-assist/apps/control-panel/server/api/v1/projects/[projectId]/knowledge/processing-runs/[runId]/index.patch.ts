import {
  controlKnowledgeProcessingRequestSchema,
  knowledgeProcessingRunResponseSchema,
} from "@ai-assist/contracts";

import { controlKnowledgeProcessing } from "../../../../../../../services/knowledge-processing";

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, "projectId");
  const runId = getRouterParam(event, "runId");
  if (!projectId || !runId) {
    throw createError({
      statusCode: 400,
      statusMessage: "Не указаны идентификаторы проекта и запуска постобработки",
    });
  }
  const parsed = controlKnowledgeProcessingRequestSchema.safeParse(await readBody(event));
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: "Некорректное состояние постобработки" });
  }
  return knowledgeProcessingRunResponseSchema.parse(
    await controlKnowledgeProcessing(event, projectId, runId, parsed.data),
  );
});
