import {
  discoverSiteStructureRequestSchema,
  discoverSiteStructureResponseSchema,
} from "@ai-assist/contracts";

import { discoverUrlKnowledgeStructure } from "../../../../../../services/crawler";

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, "projectId");
  if (!projectId)
    throw createError({ statusCode: 400, statusMessage: "Не указан идентификатор проекта" });
  const parsed = discoverSiteStructureRequestSchema.safeParse(await readBody(event));
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: "Некорректный запрос структуры сайта" });
  }
  return discoverSiteStructureResponseSchema.parse(
    await discoverUrlKnowledgeStructure(event, projectId, parsed.data),
  );
});
