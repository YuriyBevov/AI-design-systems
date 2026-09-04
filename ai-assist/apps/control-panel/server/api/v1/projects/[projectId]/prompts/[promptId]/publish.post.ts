import { promptDetailResponseSchema, publishPromptRequestSchema } from "@ai-assist/contracts";

import { publishPrompt } from "../../../../../../services/prompts";

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, "projectId");
  const promptId = getRouterParam(event, "promptId");
  if (!projectId || !promptId) {
    throw createError({ statusCode: 400, statusMessage: "Project and prompt ids are required" });
  }
  const parsed = publishPromptRequestSchema.safeParse(await readBody(event));
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: "Invalid prompt publication request" });
  }
  return promptDetailResponseSchema.parse(
    await publishPrompt(event, projectId, promptId, parsed.data),
  );
});
