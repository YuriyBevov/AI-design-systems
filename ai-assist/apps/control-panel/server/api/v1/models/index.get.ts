import { modelCapabilitySchema, modelCatalogResponseSchema } from "@ai-assist/contracts";

import { getProviderModels } from "../../../services/provider";

export default defineEventHandler(async (event) => {
  const rawCapability = getQuery(event).capability;
  const parsed = rawCapability ? modelCapabilitySchema.safeParse(rawCapability) : null;
  if (parsed && !parsed.success) {
    throw createError({ statusCode: 400, statusMessage: "Invalid model capability" });
  }
  return modelCatalogResponseSchema.parse(
    await getProviderModels(event, parsed?.success ? parsed.data : undefined),
  );
});
