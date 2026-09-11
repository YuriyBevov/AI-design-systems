import { removeProviderCredential } from "../../../../../../services/provider";

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, "projectId");
  if (!projectId)
    throw createError({ statusCode: 400, statusMessage: "Не указан идентификатор проекта" });
  await removeProviderCredential(event, projectId);
  return { status: "ok" as const };
});
