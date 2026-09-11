import { promptDetailResponseSchema } from "@ai-assist/contracts";

import { getPrompt } from "../../../../../../services/prompts";

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, "projectId");
  const promptId = getRouterParam(event, "promptId");
  if (!projectId || !promptId) {
    throw createError({
      statusCode: 400,
      statusMessage: "Не указаны идентификаторы проекта и роли ассистента",
    });
  }
  return promptDetailResponseSchema.parse(await getPrompt(event, projectId, promptId));
});
