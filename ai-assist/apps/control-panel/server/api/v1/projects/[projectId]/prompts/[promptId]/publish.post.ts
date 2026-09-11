import { promptDetailResponseSchema, publishPromptRequestSchema } from "@ai-assist/contracts";

import { publishPrompt } from "../../../../../../services/prompts";

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, "projectId");
  const promptId = getRouterParam(event, "promptId");
  if (!projectId || !promptId) {
    throw createError({
      statusCode: 400,
      statusMessage: "Не указаны идентификаторы проекта и роли ассистента",
    });
  }
  const parsed = publishPromptRequestSchema.safeParse(await readBody(event));
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: "Некорректный запрос применения роли ассистента",
    });
  }
  return promptDetailResponseSchema.parse(
    await publishPrompt(event, projectId, promptId, parsed.data),
  );
});
