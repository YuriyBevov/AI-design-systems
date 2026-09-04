import { describe, expect, it } from "vitest";

import {
  providerStateResponseSchema,
  saveProviderCredentialRequestSchema,
  updateProjectModelSettingsRequestSchema,
} from "../src/index.js";

describe("provider contracts", () => {
  it("accepts the documented AITUNNEL key prefix and rejects injected fields", () => {
    expect(
      saveProviderCredentialRequestSchema.safeParse({ apiKey: "sk-aitunnel-fake-value-1234" })
        .success,
    ).toBe(true);
    expect(
      saveProviderCredentialRequestSchema.safeParse({
        apiKey: "  sk-aitunnel-fake-value-1234\n",
      }).success,
    ).toBe(true);
    expect(
      saveProviderCredentialRequestSchema.safeParse({
        apiKey: "sk-aitunnel-fake-value-1234 — use this key",
      }).success,
    ).toBe(false);
    expect(
      saveProviderCredentialRequestSchema.safeParse({
        apiKey: "sk-aitunnel-fake-value-1234",
        projectId: "00000000-0000-4000-8000-000000000001",
      }).success,
    ).toBe(false);
  });

  it("never exposes a plaintext credential field", () => {
    expect(
      providerStateResponseSchema.safeParse({
        provider: "aitunnel",
        credential: null,
        apiKey: "must-not-be-accepted",
      }).success,
    ).toBe(true);
    expect(
      "apiKey" in providerStateResponseSchema.parse({ provider: "aitunnel", credential: null }),
    ).toBe(false);
  });

  it("rejects auto for embeddings at the domain boundary later and strict unknown DTO fields here", () => {
    expect(
      updateProjectModelSettingsRequestSchema.safeParse({ embeddingModelId: "auto" }).success,
    ).toBe(true);
    expect(
      updateProjectModelSettingsRequestSchema.safeParse({ chatModelId: "model", unsafe: true })
        .success,
    ).toBe(false);
  });
});
