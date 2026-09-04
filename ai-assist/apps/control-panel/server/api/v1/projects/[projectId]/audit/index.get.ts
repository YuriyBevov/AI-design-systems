import { auditEventResponseSchema } from "@ai-assist/contracts";

import { getProjectAudit } from "../../../../../services/projects";

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, "projectId");
  if (!projectId) {
    throw createError({ statusCode: 400, statusMessage: "Project id is required" });
  }

  return auditEventResponseSchema.array().parse(await getProjectAudit(event, projectId));
});
