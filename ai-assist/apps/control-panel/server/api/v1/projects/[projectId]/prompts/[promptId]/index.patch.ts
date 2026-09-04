import { promptDetailResponseSchema, updatePromptRequestSchema } from "@ai-assist/contracts";

import { patchPrompt } from "../../../../../../services/prompts";

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, "projectId");
  const promptId = getRouterParam(event, "promptId");
  if (!projectId || !promptId) {
    throw createError({ statusCode: 400, statusMessage: "Project and prompt ids are required" });
  }
  const parsed = updatePromptRequestSchema.safeParse(await readBody(event));
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: "Invalid prompt update request" });
  }
  return promptDetailResponseSchema.parse(
    await patchPrompt(event, projectId, promptId, parsed.data),
  );
});
