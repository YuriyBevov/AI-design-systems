import { projectResponseSchema, updateProjectRequestSchema } from "@ai-assist/contracts";

import { patchProject } from "../../../../services/projects";

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, "projectId");
  if (!projectId) {
    throw createError({ statusCode: 400, statusMessage: "Не указан идентификатор проекта" });
  }

  const parsed = updateProjectRequestSchema.safeParse(await readBody(event));
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: "Некорректные данные проекта" });
  }

  return projectResponseSchema.parse(await patchProject(event, projectId, parsed.data));
});
