import { publishedPromptResponseSchema } from "@ai-assist/contracts";

import { getPublishedPrompt } from "../../../../services/prompts";

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, "projectId");
  if (!projectId) throw createError({ statusCode: 400, statusMessage: "Project id is required" });
  const published = await getPublishedPrompt(event, projectId);
  return published ? publishedPromptResponseSchema.parse(published) : null;
});
