import { describe, expect, it } from "vitest";

import {
  isLocalCredentialEncryptionKey,
  isValidCredentialEncryptionKey,
  parseServiceEnvironment,
} from "../src/index.js";

describe("service environment", () => {
  it("refuses local session and encryption keys in production", () => {
    expect(() => parseServiceEnvironment({ NODE_ENV: "production" })).toThrow();
  });

  it("accepts independent production secrets", () => {
    const environment = parseServiceEnvironment({
      NODE_ENV: "production",
      SESSION_SECRET: "production-session-secret-with-at-least-32-chars",
      CREDENTIAL_ENCRYPTION_KEY: Buffer.from("abcdef0123456789abcdef0123456789").toString("base64"),
    });

    expect(environment.CREDENTIAL_ENCRYPTION_KEY_VERSION).toBe(1);
    expect(environment.PROMPT_PREVIEW_RATE_LIMIT_MAX).toBe(12);
    expect(environment.PROMPT_PREVIEW_RATE_LIMIT_WINDOW_SECONDS).toBe(60);
    expect(environment.WIDGET_SESSION_TTL_HOURS).toBe(72);
    expect(environment.WIDGET_CHAT_RATE_LIMIT_MAX).toBe(20);
    expect(environment.PROVIDER_RESPONSE_MAX_BYTES).toBe(1_048_576);
    expect(isLocalCredentialEncryptionKey(environment.CREDENTIAL_ENCRYPTION_KEY)).toBe(false);
    expect(isValidCredentialEncryptionKey(environment.CREDENTIAL_ENCRYPTION_KEY)).toBe(true);
  });

  it("identifies the development credential encryption key", () => {
    const environment = parseServiceEnvironment({ NODE_ENV: "development" });
    expect(isLocalCredentialEncryptionKey(environment.CREDENTIAL_ENCRYPTION_KEY)).toBe(true);
    expect(isValidCredentialEncryptionKey(environment.CREDENTIAL_ENCRYPTION_KEY)).toBe(true);
  });

  it("rejects provider credentials used as an encryption master key", () => {
    expect(isValidCredentialEncryptionKey("sk-aitunnel-not-a-base64-master-key-value")).toBe(false);
  });

  it("rejects unsafe prompt preview rate-limit settings", () => {
    expect(() =>
      parseServiceEnvironment({ PROMPT_PREVIEW_RATE_LIMIT_WINDOW_SECONDS: "5" }),
    ).toThrow();
  });

  it("rejects unsafe widget session and chat limits", () => {
    expect(() => parseServiceEnvironment({ WIDGET_SESSION_TTL_HOURS: "0" })).toThrow();
    expect(() => parseServiceEnvironment({ WIDGET_CHAT_RATE_LIMIT_WINDOW_SECONDS: "5" })).toThrow();
  });
});
