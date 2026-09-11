import { promptRevisionResponseSchema } from "@ai-assist/contracts";

import { getPromptRevision } from "../../../../../../../services/prompts";

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, "projectId");
  const promptId = getRouterParam(event, "promptId");
  const revisionId = getRouterParam(event, "revisionId");
  if (!projectId || !promptId || !revisionId) {
    throw createError({
      statusCode: 400,
      statusMessage: "Не указаны идентификаторы версии роли ассистента",
    });
  }
  return promptRevisionResponseSchema.parse(
    await getPromptRevision(event, projectId, promptId, revisionId),
  );
});
