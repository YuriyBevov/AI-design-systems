import {
  providerStateResponseSchema,
  saveProviderCredentialRequestSchema,
} from "@ai-assist/contracts";

import { saveProviderCredential } from "../../../../../../services/provider";

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, "projectId");
  if (!projectId) throw createError({ statusCode: 400, statusMessage: "Project id is required" });
  const parsed = saveProviderCredentialRequestSchema.safeParse(await readBody(event));
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: "Invalid provider credential request",
      data: { code: "PROVIDER_CREDENTIAL_FORMAT_INVALID", retryable: false },
    });
  }
  return providerStateResponseSchema.parse(
    await saveProviderCredential(event, projectId, parsed.data.apiKey),
  );
});
