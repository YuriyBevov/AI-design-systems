import { promptPreviewRequestSchema, promptPreviewResponseSchema } from "@ai-assist/contracts";

import { previewPrompt } from "../../../../../../services/prompts";

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, "projectId");
  const promptId = getRouterParam(event, "promptId");
  if (!projectId || !promptId) {
    throw createError({
      statusCode: 400,
      statusMessage: "Не указаны идентификаторы проекта и роли ассистента",
    });
  }
  const parsed = promptPreviewRequestSchema.safeParse(await readBody(event));
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: "Некорректный тестовый запрос роли ассистента",
    });
  }
  return promptPreviewResponseSchema.parse(
    await previewPrompt(event, projectId, promptId, parsed.data),
  );
});
