import { syncModelsRequestSchema, syncModelsResponseSchema } from "@ai-assist/contracts";

import { syncProviderModels } from "../../../services/provider";

export default defineEventHandler(async (event) => {
  const parsed = syncModelsRequestSchema.safeParse(await readBody(event));
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: "Некорректный запрос обновления моделей" });
  }
  return syncModelsResponseSchema.parse(await syncProviderModels(event, parsed.data.projectId));
});
