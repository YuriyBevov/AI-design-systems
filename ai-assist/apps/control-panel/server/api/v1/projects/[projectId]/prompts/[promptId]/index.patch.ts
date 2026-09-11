import { promptDetailResponseSchema, updatePromptRequestSchema } from "@ai-assist/contracts";

import { patchPrompt } from "../../../../../../services/prompts";

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, "projectId");
  const promptId = getRouterParam(event, "promptId");
  if (!projectId || !promptId) {
    throw createError({
      statusCode: 400,
      statusMessage: "Не указаны идентификаторы проекта и роли ассистента",
    });
  }
  const parsed = updatePromptRequestSchema.safeParse(await readBody(event));
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: "Некорректные данные роли ассистента" });
  }
  return promptDetailResponseSchema.parse(
    await patchPrompt(event, projectId, promptId, parsed.data),
  );
});
