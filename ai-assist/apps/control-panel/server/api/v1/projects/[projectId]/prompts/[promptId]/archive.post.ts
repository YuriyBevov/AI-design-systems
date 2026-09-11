import { archivePromptRequestSchema, promptDetailResponseSchema } from "@ai-assist/contracts";

import { archivePrompt } from "../../../../../../services/prompts";

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, "projectId");
  const promptId = getRouterParam(event, "promptId");
  if (!projectId || !promptId) {
    throw createError({
      statusCode: 400,
      statusMessage: "Не указаны идентификаторы проекта и роли ассистента",
    });
  }
  const parsed = archivePromptRequestSchema.safeParse(await readBody(event));
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: "Некорректный запрос архивации роли ассистента",
    });
  }
  return promptDetailResponseSchema.parse(
    await archivePrompt(event, projectId, promptId, parsed.data),
  );
});
