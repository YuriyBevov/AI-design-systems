import { adminSessionResponseSchema } from "@ai-assist/contracts";

import { getAdminSessionResponse } from "../../../services/auth";

export default defineEventHandler(async (event) =>
  adminSessionResponseSchema.parse(await getAdminSessionResponse(event)),
);
