import { adminSessionResponseSchema } from "@ai-assist/contracts";

import { getAdminSessionResponse } from "../../../services/auth";

export default defineEventHandler(async (event) => {
  const session = adminSessionResponseSchema.parse(await getAdminSessionResponse(event));
  return session.projects;
});
