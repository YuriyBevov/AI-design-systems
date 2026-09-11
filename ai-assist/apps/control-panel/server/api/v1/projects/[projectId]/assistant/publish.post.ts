import {
  assistantSettingsResponseSchema,
  publishAssistantRequestSchema,
} from "@ai-assist/contracts";

import { publishAssistant } from "../../../../../services/assistant";

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, "projectId");
  if (!projectId) {
    throw createError({ statusCode: 400, statusMessage: "Не указан идентификатор проекта" });
  }
  const parsed = publishAssistantRequestSchema.safeParse(await readBody(event));
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: "Некорректный запрос публикации настроек ассистента",
    });
  }
  return assistantSettingsResponseSchema.parse(
    await publishAssistant(event, projectId, parsed.data),
  );
});
