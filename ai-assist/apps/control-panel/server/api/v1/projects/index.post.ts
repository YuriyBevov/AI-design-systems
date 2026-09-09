import { createProjectRequestSchema, projectResponseSchema } from "@ai-assist/contracts";

import { createProject } from "../../../services/projects";

export default defineEventHandler(async (event) => {
  const parsed = createProjectRequestSchema.safeParse(await readBody(event));
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: "Invalid project creation request" });
  }
  return projectResponseSchema.parse(await createProject(event, parsed.data));
});
