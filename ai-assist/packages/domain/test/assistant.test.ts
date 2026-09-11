import { describe, expect, it } from "vitest";

import { checksumAssistantConfig, normalizeAssistantOrigins } from "../src/index.js";

describe("assistant config policies", () => {
  it("normalizes exact HTTPS origins and removes default ports", () => {
    expect(normalizeAssistantOrigins([{ origin: "HTTPS://Example.COM:443" }])).toEqual({
      success: true,
      origins: [
        {
          origin: "https://example.com",
          environment: "production",
          scheme: "https",
          host: "example.com",
          port: null,
        },
      ],
    });
  });

  it("allows plain HTTP only for a local preview origin", () => {
    expect(normalizeAssistantOrigins([{ origin: "http://localhost:3001" }])).toMatchObject({
      success: true,
      origins: [{ environment: "preview" }],
    });
    expect(normalizeAssistantOrigins([{ origin: "https://127.0.0.1" }])).toMatchObject({
      success: true,
      origins: [{ environment: "preview" }],
    });
    expect(normalizeAssistantOrigins([{ origin: "http://example.com" }])).toMatchObject({
      success: false,
      code: "ASSISTANT_ORIGIN_HTTPS_REQUIRED",
    });
  });

  it("rejects paths, credentials, wildcards and duplicate origins", () => {
    for (const origin of [
      "https://example.com/catalog",
      "https://user:pass@example.com",
      "https://*.example.com",
    ]) {
      expect(normalizeAssistantOrigins([{ origin }]).success).toBe(false);
    }
    expect(
      normalizeAssistantOrigins([
        { origin: "https://example.com" },
        { origin: "https://EXAMPLE.com/" },
      ]),
    ).toMatchObject({ success: false, code: "ASSISTANT_ORIGIN_DUPLICATE", index: 1 });
  });

  it("creates a stable SHA-256 checksum", () => {
    const config = { name: "Помощник", enabled: true };
    expect(checksumAssistantConfig(config)).toMatch(/^[a-f0-9]{64}$/u);
    expect(checksumAssistantConfig(config)).toBe(checksumAssistantConfig(config));
  });
});
