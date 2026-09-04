import { logoutAdmin } from "../../../services/auth";

export default defineEventHandler(async (event) => {
  await logoutAdmin(event);
  return { status: "ok" as const };
});
