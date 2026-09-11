import { createUserRequestSchema, userResponseSchema } from "@ai-assist/contracts";

import { createUser } from "../../../services/users";

export default defineEventHandler(async (event) => {
  const parsed = createUserRequestSchema.safeParse(await readBody(event));
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: "Некорректные данные пользователя" });
  }
  return userResponseSchema.parse(await createUser(event, parsed.data));
});
