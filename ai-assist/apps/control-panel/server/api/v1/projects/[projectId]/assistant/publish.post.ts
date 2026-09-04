import {
  assistantSettingsResponseSchema,
  publishAssistantRequestSchema,
} from "@ai-assist/contracts";

import { publishAssistant } from "../../../../../services/assistant";

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, "projectId");
  if (!projectId) {
    throw createError({ statusCode: 400, statusMessage: "Project id is required" });
  }
  const parsed = publishAssistantRequestSchema.safeParse(await readBody(event));
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: "Invalid assistant publication request" });
  }
  return assistantSettingsResponseSchema.parse(
    await publishAssistant(event, projectId, parsed.data),
  );
});
