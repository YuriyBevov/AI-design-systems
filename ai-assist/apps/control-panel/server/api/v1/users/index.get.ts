import { userListResponseSchema } from "@ai-assist/contracts";

import { listUsers } from "../../../services/users";

export default defineEventHandler(async (event) =>
  userListResponseSchema.parse(await listUsers(event)),
);
