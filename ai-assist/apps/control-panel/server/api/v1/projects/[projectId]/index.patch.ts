import { projectResponseSchema, updateProjectRequestSchema } from "@ai-assist/contracts";

import { patchProject } from "../../../../services/projects";

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, "projectId");
  if (!projectId) {
    throw createError({ statusCode: 400, statusMessage: "Project id is required" });
  }

  const parsed = updateProjectRequestSchema.safeParse(await readBody(event));
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: "Invalid project update" });
  }

  return projectResponseSchema.parse(await patchProject(event, projectId, parsed.data));
});
