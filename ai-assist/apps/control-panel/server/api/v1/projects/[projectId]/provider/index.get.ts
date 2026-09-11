import { providerStateResponseSchema } from "@ai-assist/contracts";

import { getProviderState } from "../../../../../services/provider";

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, "projectId");
  if (!projectId)
    throw createError({ statusCode: 400, statusMessage: "Не указан идентификатор проекта" });
  return providerStateResponseSchema.parse(await getProviderState(event, projectId));
});
