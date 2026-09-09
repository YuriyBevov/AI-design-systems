import { projectResponseSchema, updateProjectStatusRequestSchema } from "@ai-assist/contracts";

import { changeProjectStatus } from "../../../../services/projects";

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, "projectId");
  if (!projectId) {
    throw createError({ statusCode: 400, statusMessage: "Project id is required" });
  }
  const parsed = updateProjectStatusRequestSchema.safeParse(await readBody(event));
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: "Invalid project status update" });
  }
  return projectResponseSchema.parse(await changeProjectStatus(event, projectId, parsed.data));
});
