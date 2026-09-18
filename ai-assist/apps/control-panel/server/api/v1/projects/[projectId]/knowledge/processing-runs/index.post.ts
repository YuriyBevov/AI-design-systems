import {
  requestKnowledgeProcessingResponseSchema,
  requestKnowledgeProcessingSchema,
} from "@ai-assist/contracts";

import { requestKnowledgeProcessing } from "../../../../../../services/knowledge-processing";

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, "projectId");
  if (!projectId) {
    throw createError({ statusCode: 400, statusMessage: "Не указан идентификатор проекта" });
  }
  const parsed = requestKnowledgeProcessingSchema.safeParse(await readBody(event));
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: "Некорректная инструкция обработки" });
  }
  const response = requestKnowledgeProcessingResponseSchema.parse(
    await requestKnowledgeProcessing(event, projectId, parsed.data),
  );
  setResponseStatus(event, 202);
  return response;
});
