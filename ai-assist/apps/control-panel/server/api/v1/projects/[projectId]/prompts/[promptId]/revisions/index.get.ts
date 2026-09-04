import { promptRevisionResponseSchema } from "@ai-assist/contracts";

import { getPrompt } from "../../../../../../../services/prompts";

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, "projectId");
  const promptId = getRouterParam(event, "promptId");
  if (!projectId || !promptId) {
    throw createError({ statusCode: 400, statusMessage: "Project and prompt ids are required" });
  }
  const detail = await getPrompt(event, projectId, promptId);
  return promptRevisionResponseSchema.array().parse(detail.revisions);
});
