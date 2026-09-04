import { describe, expect, it } from "vitest";

import {
  assistantSettingsResponseSchema,
  updateAssistantDraftRequestSchema,
} from "../src/index.js";

const validDraft = {
  expectedVersion: 1,
  name: "Помощник",
  greeting: "Здравствуйте! Чем помочь?",
  placeholder: "Введите вопрос",
  accentColor: "#315EFB",
  launcherPosition: "right",
  contactFallback: null,
  locale: "ru",
  enabled: true,
  maintenanceMessage: null,
  maxConversationTurns: 20,
  responseTimeoutSeconds: 45,
  dailyRateLimit: 500,
  citationsEnabled: true,
  allowedOrigins: [{ origin: "https://example.com", environment: "production" }],
};

describe("assistant contracts", () => {
  it("accepts a complete versioned draft", () => {
    expect(updateAssistantDraftRequestSchema.parse(validDraft)).toEqual(validDraft);
  });

  it("rejects partial settings and unknown fields", () => {
    expect(updateAssistantDraftRequestSchema.safeParse({ expectedVersion: 1 }).success).toBe(false);
    expect(
      updateAssistantDraftRequestSchema.safeParse({ ...validDraft, providerKey: "secret" }).success,
    ).toBe(false);
  });

  it("requires at least one bounded Origin", () => {
    expect(
      updateAssistantDraftRequestSchema.safeParse({ ...validDraft, allowedOrigins: [] }).success,
    ).toBe(false);
  });

  it("does not expose prompt or provider secrets in settings response", () => {
    const shape = assistantSettingsResponseSchema.keyof().options;
    expect(shape).not.toContain("prompt");
    expect(shape).not.toContain("apiKey");
  });
});
