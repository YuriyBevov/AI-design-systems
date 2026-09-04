import type { AdminSessionResponse } from "@ai-assist/contracts";

export default defineNuxtRouteMiddleware(async (to) => {
  const session = useAdminSessionState();

  if (session.value === undefined) {
    try {
      session.value = await useRequestFetch()<AdminSessionResponse>("/api/v1/auth/session");
    } catch {
      session.value = null;
    }
  }

  if (to.path === "/login") {
    if (session.value) {
      return navigateTo("/");
    }

    return;
  }

  if (!session.value) {
    return navigateTo("/login");
  }
});
