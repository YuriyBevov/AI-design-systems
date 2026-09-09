import { projectResponseSchema } from "@ai-assist/contracts";

import { archiveProject } from "../../../../services/projects";

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, "projectId");
  if (!projectId) {
    throw createError({ statusCode: 400, statusMessage: "Project id is required" });
  }
  return projectResponseSchema.parse(await archiveProject(event, projectId));
});
