import { projectResponseSchema } from "@ai-assist/contracts";

import { getProject } from "../../../../services/projects";

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, "projectId");
  if (!projectId) {
    throw createError({ statusCode: 400, statusMessage: "Не указан идентификатор проекта" });
  }

  return projectResponseSchema.parse(await getProject(event, projectId));
});
