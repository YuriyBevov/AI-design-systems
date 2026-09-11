import { reauthenticateRequestSchema, reauthenticateResponseSchema } from "@ai-assist/contracts";

import { reauthenticateAdmin } from "../../../services/auth";

export default defineEventHandler(async (event) => {
  const parsed = reauthenticateRequestSchema.safeParse(await readBody(event));
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: "Invalid reauthentication request" });
  }

  return reauthenticateResponseSchema.parse(await reauthenticateAdmin(event, parsed.data.password));
});
