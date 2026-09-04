import { projectModelSettingsResponseSchema } from "@ai-assist/contracts";

import { getProjectModelSettings } from "../../../../../services/provider";

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, "projectId");
  if (!projectId) throw createError({ statusCode: 400, statusMessage: "Project id is required" });
  return projectModelSettingsResponseSchema.parse(await getProjectModelSettings(event, projectId));
});
