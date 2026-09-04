import {
  projectModelSettingsResponseSchema,
  updateProjectModelSettingsRequestSchema,
} from "@ai-assist/contracts";

import { updateProjectModelSettings } from "../../../../../services/provider";

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, "projectId");
  if (!projectId) throw createError({ statusCode: 400, statusMessage: "Project id is required" });
  const parsed = updateProjectModelSettingsRequestSchema.safeParse(await readBody(event));
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: "Invalid model settings request" });
  }
  return projectModelSettingsResponseSchema.parse(
    await updateProjectModelSettings(event, projectId, parsed.data),
  );
});
