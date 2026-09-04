import { createPromptRequestSchema, promptDetailResponseSchema } from "@ai-assist/contracts";

import { createPrompt } from "../../../../../services/prompts";

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, "projectId");
  if (!projectId) throw createError({ statusCode: 400, statusMessage: "Project id is required" });
  const parsed = createPromptRequestSchema.safeParse(await readBody(event));
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: "Invalid prompt create request" });
  }
  return promptDetailResponseSchema.parse(await createPrompt(event, projectId, parsed.data));
});
