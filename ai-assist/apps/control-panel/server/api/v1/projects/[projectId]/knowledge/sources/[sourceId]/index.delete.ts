import {
  deleteUrlKnowledgeSourceQuerySchema,
  deleteUrlKnowledgeSourceResponseSchema,
} from "@ai-assist/contracts";

import { deleteUrlKnowledgeSource } from "../../../../../../../services/crawler";

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, "projectId");
  const sourceId = getRouterParam(event, "sourceId");
  if (!projectId || !sourceId) {
    throw createError({
      statusCode: 400,
      statusMessage: "Не указаны идентификаторы проекта и источника",
    });
  }
  const parsed = deleteUrlKnowledgeSourceQuerySchema.safeParse(getQuery(event));
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: "Некорректная версия источника сайта" });
  }
  return deleteUrlKnowledgeSourceResponseSchema.parse(
    await deleteUrlKnowledgeSource(event, projectId, sourceId, parsed.data),
  );
});
