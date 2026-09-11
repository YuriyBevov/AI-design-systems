import { promptListResponseSchema } from "@ai-assist/contracts";

import { getPrompts } from "../../../../../services/prompts";

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, "projectId");
  if (!projectId)
    throw createError({ statusCode: 400, statusMessage: "Не указан идентификатор проекта" });
  return promptListResponseSchema.parse(await getPrompts(event, projectId));
});
