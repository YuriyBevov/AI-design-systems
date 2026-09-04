import {
  createPromptRevisionRequestSchema,
  promptDetailResponseSchema,
} from "@ai-assist/contracts";

import { createPromptRevision } from "../../../../../../../services/prompts";

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, "projectId");
  const promptId = getRouterParam(event, "promptId");
  if (!projectId || !promptId) {
    throw createError({ statusCode: 400, statusMessage: "Project and prompt ids are required" });
  }
  const parsed = createPromptRevisionRequestSchema.safeParse(await readBody(event));
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: "Invalid prompt revision request" });
  }
  return promptDetailResponseSchema.parse(
    await createPromptRevision(event, projectId, promptId, parsed.data),
  );
});
