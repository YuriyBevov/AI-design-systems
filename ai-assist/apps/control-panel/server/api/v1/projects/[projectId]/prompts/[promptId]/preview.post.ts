import { promptPreviewRequestSchema, promptPreviewResponseSchema } from "@ai-assist/contracts";

import { previewPrompt } from "../../../../../../services/prompts";

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, "projectId");
  const promptId = getRouterParam(event, "promptId");
  if (!projectId || !promptId) {
    throw createError({ statusCode: 400, statusMessage: "Project and prompt ids are required" });
  }
  const parsed = promptPreviewRequestSchema.safeParse(await readBody(event));
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: "Invalid prompt preview request" });
  }
  return promptPreviewResponseSchema.parse(
    await previewPrompt(event, projectId, promptId, parsed.data),
  );
});
