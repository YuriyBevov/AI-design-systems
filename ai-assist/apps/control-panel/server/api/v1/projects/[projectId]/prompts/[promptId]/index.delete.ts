import { deletePromptQuerySchema, deletePromptResponseSchema } from "@ai-assist/contracts";

import { deletePrompt } from "../../../../../../services/prompts";

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, "projectId");
  const promptId = getRouterParam(event, "promptId");
  if (!projectId || !promptId) {
    throw createError({
      statusCode: 400,
      statusMessage: "Не указаны идентификаторы проекта и роли ассистента",
    });
  }
  const parsed = deletePromptQuerySchema.safeParse(getQuery(event));
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: "Некорректный запрос удаления роли ассистента",
    });
  }
  return deletePromptResponseSchema.parse(
    await deletePrompt(event, projectId, promptId, parsed.data.expectedVersion),
  );
});
