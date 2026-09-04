import { adminSessionResponseSchema, loginRequestSchema } from "@ai-assist/contracts";

import { loginAdmin } from "../../../services/auth";

export default defineEventHandler(async (event) => {
  const parsed = loginRequestSchema.safeParse(await readBody(event));
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: "Invalid login request" });
  }

  const credentials = parsed.data;
  return adminSessionResponseSchema.parse(await loginAdmin(event, credentials));
});
