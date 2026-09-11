import {
  createUrlKnowledgeSourceRequestSchema,
  urlKnowledgeSourceResponseSchema,
} from "@ai-assist/contracts";

import { createUrlKnowledgeSource } from "../../../../../../services/crawler";

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, "projectId");
  if (!projectId)
    throw createError({ statusCode: 400, statusMessage: "Не указан идентификатор проекта" });
  const parsed = createUrlKnowledgeSourceRequestSchema.safeParse(await readBody(event));
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: "Некорректные данные источника сайта" });
  }
  return urlKnowledgeSourceResponseSchema.parse(
    await createUrlKnowledgeSource(event, projectId, parsed.data),
  );
});
