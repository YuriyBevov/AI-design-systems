import { urlKnowledgeSourceListResponseSchema } from "@ai-assist/contracts";

import { getUrlKnowledgeSources } from "../../../../../../services/crawler";

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, "projectId");
  if (!projectId)
    throw createError({ statusCode: 400, statusMessage: "Не указан идентификатор проекта" });
  return urlKnowledgeSourceListResponseSchema.parse(await getUrlKnowledgeSources(event, projectId));
});
