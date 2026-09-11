import { updateUserRequestSchema, userResponseSchema } from "@ai-assist/contracts";

import { patchUser } from "../../../services/users";

export default defineEventHandler(async (event) => {
  const userId = getRouterParam(event, "userId");
  if (!userId)
    throw createError({ statusCode: 400, statusMessage: "Не указан идентификатор пользователя" });
  const parsed = updateUserRequestSchema.safeParse(await readBody(event));
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: "Некорректные данные пользователя" });
  }
  return userResponseSchema.parse(await patchUser(event, userId, parsed.data));
});
