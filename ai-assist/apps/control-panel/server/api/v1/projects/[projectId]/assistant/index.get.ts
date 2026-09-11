import { assistantSettingsResponseSchema } from "@ai-assist/contracts";

import { getAssistantSettings } from "../../../../../services/assistant";

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, "projectId");
  if (!projectId) {
    throw createError({ statusCode: 400, statusMessage: "Не указан идентификатор проекта" });
  }
  return assistantSettingsResponseSchema.parse(await getAssistantSettings(event, projectId));
});
