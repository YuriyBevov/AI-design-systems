import type { AdminSessionResponse } from "@ai-assist/contracts";

export const useAdminSessionState = () =>
  useState<AdminSessionResponse | null | undefined>("admin-session", () => undefined);

export const getCsrfHeaders = (): Record<string, string> => {
  const csrfToken = useCookie<string | null>("ai_assist_csrf").value;
  if (!csrfToken) {
    throw new Error("CSRF token is missing");
  }

  return { "x-csrf-token": csrfToken };
};
