import { providerCredentialTestResponseSchema } from "@ai-assist/contracts";

import { testStoredProviderCredential } from "../../../../../../services/provider";

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, "projectId");
  if (!projectId) throw createError({ statusCode: 400, statusMessage: "Project id is required" });
  return providerCredentialTestResponseSchema.parse(
    await testStoredProviderCredential(event, projectId),
  );
});
