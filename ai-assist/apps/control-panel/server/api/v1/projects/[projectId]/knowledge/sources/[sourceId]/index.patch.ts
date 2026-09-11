import {
  updateUrlKnowledgeSourceRequestSchema,
  urlKnowledgeSourceResponseSchema,
} from "@ai-assist/contracts";

import { updateUrlKnowledgeSource } from "../../../../../../../services/crawler";

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, "projectId");
  const sourceId = getRouterParam(event, "sourceId");
  if (!projectId || !sourceId) {
    throw createError({
      statusCode: 400,
      statusMessage: "Не указаны идентификаторы проекта и источника",
    });
  }
  const parsed = updateUrlKnowledgeSourceRequestSchema.safeParse(await readBody(event));
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: "Некорректные данные источника сайта" });
  }
  return urlKnowledgeSourceResponseSchema.parse(
    await updateUrlKnowledgeSource(event, projectId, sourceId, parsed.data),
  );
});
