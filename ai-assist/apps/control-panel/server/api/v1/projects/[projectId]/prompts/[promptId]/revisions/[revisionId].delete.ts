import { deletePromptQuerySchema, promptDetailResponseSchema } from "@ai-assist/contracts";

import { deletePromptRevision } from "../../../../../../../services/prompts";

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, "projectId");
  const promptId = getRouterParam(event, "promptId");
  const revisionId = getRouterParam(event, "revisionId");
  if (!projectId || !promptId || !revisionId) {
    throw createError({ statusCode: 400, statusMessage: "Prompt revision ids are required" });
  }
  const parsed = deletePromptQuerySchema.safeParse(getQuery(event));
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: "Invalid prompt revision delete request" });
  }
  return promptDetailResponseSchema.parse(
    await deletePromptRevision(event, projectId, promptId, revisionId, parsed.data.expectedVersion),
  );
});
