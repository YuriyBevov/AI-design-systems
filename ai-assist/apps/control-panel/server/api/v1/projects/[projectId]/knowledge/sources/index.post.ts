import {
  createUrlKnowledgeSourceRequestSchema,
  urlKnowledgeSourceResponseSchema,
} from "@ai-assist/contracts";

import { createUrlKnowledgeSource } from "../../../../../../services/crawler";

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, "projectId");
  if (!projectId) throw createError({ statusCode: 400, statusMessage: "Project id is required" });
  const parsed = createUrlKnowledgeSourceRequestSchema.safeParse(await readBody(event));
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: "Invalid URL source request" });
  }
  return urlKnowledgeSourceResponseSchema.parse(
    await createUrlKnowledgeSource(event, projectId, parsed.data),
  );
});
