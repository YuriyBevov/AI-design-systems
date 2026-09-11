import {
  assistantSettingsResponseSchema,
  updateAssistantDraftRequestSchema,
} from "@ai-assist/contracts";

import { patchAssistantDraft } from "../../../../../services/assistant";

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, "projectId");
  if (!projectId) {
    throw createError({ statusCode: 400, statusMessage: "Не указан идентификатор проекта" });
  }
  const parsed = updateAssistantDraftRequestSchema.safeParse(await readBody(event));
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: "Некорректные настройки ассистента" });
  }
  return assistantSettingsResponseSchema.parse(
    await patchAssistantDraft(event, projectId, parsed.data),
  );
});
