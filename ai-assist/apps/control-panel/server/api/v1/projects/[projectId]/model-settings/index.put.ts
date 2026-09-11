import {
  projectModelSettingsResponseSchema,
  updateProjectModelSettingsRequestSchema,
} from "@ai-assist/contracts";

import { updateProjectModelSettings } from "../../../../../services/provider";

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, "projectId");
  if (!projectId)
    throw createError({ statusCode: 400, statusMessage: "Не указан идентификатор проекта" });
  const parsed = updateProjectModelSettingsRequestSchema.safeParse(await readBody(event));
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: "Некорректные настройки моделей" });
  }
  return projectModelSettingsResponseSchema.parse(
    await updateProjectModelSettings(event, projectId, parsed.data),
  );
});
