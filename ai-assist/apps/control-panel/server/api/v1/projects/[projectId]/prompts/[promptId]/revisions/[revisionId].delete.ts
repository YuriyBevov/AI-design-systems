import { deletePromptQuerySchema, promptDetailResponseSchema } from "@ai-assist/contracts";

import { deletePromptRevision } from "../../../../../../../services/prompts";

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
  const parsed = deletePromptQuerySchema.safeParse(getQuery(event));
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: "Некорректный запрос удаления версии роли ассистента",
    });
  }
  return promptDetailResponseSchema.parse(
    await deletePromptRevision(event, projectId, promptId, revisionId, parsed.data.expectedVersion),
  );
});
