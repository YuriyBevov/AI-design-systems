import { describe, expect, it } from "vitest";

import { assertRecentAdminAuthentication } from "../server/services/auth";
import type { AuthSessionRecord } from "../server/repositories/auth";

const createSession = (reauthenticatedAt: Date): AuthSessionRecord => ({
  id: "a868d3cc-c71b-4ae4-9706-930ddb2bfa67",
  userId: "f7bf26a5-bae8-4472-8d41-a7f2a6cbf699",
  name: "Администратор",
  email: "admin@example.test",
  role: "admin",
  csrfTokenHash: "0".repeat(64),
  expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  reauthenticatedAt,
  createdAt: new Date(Date.now() - 12 * 60 * 60 * 1000),
});

describe("recent authentication", () => {
  it("uses the latest password confirmation instead of session creation time", () => {
    expect(() => assertRecentAdminAuthentication(createSession(new Date()))).not.toThrow();
  });

  it("rejects a confirmation older than the configured window", () => {
    const staleConfirmation = new Date(Date.now() - 31 * 60 * 1000);
    expect(() => assertRecentAdminAuthentication(createSession(staleConfirmation))).toThrow(
      "Recent authentication required",
    );
  });
});
