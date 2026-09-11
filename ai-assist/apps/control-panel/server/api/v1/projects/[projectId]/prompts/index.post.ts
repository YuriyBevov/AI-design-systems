import { createPromptRequestSchema, promptDetailResponseSchema } from "@ai-assist/contracts";

import { createPrompt } from "../../../../../services/prompts";

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, "projectId");
  if (!projectId)
    throw createError({ statusCode: 400, statusMessage: "Не указан идентификатор проекта" });
  const parsed = createPromptRequestSchema.safeParse(await readBody(event));
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: "Некорректные данные роли ассистента" });
  }
  return promptDetailResponseSchema.parse(await createPrompt(event, projectId, parsed.data));
});
