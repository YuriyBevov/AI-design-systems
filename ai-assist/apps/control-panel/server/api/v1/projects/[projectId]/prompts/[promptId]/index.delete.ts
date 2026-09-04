import { deletePromptQuerySchema, deletePromptResponseSchema } from "@ai-assist/contracts";

import { deletePrompt } from "../../../../../../services/prompts";

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, "projectId");
  const promptId = getRouterParam(event, "promptId");
  if (!projectId || !promptId) {
    throw createError({ statusCode: 400, statusMessage: "Project and prompt ids are required" });
  }
  const parsed = deletePromptQuerySchema.safeParse(getQuery(event));
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: "Invalid prompt delete request" });
  }
  return deletePromptResponseSchema.parse(
    await deletePrompt(event, projectId, promptId, parsed.data.expectedVersion),
  );
});
