import { describe, expect, it } from "vitest";

import {
  createWidgetSessionRequestSchema,
  widgetChatRequestSchema,
  widgetSessionResponseSchema,
} from "../src/index.js";

describe("widget contracts", () => {
  it("accepts a bounded public session request", () => {
    expect(
      createWidgetSessionRequestSchema.parse({
        assistantId: "asst_public_example_123456",
        widgetVersion: "1.0.0",
        locale: "ru",
      }),
    ).toEqual({
      assistantId: "asst_public_example_123456",
      widgetVersion: "1.0.0",
      locale: "ru",
    });
  });

  it("rejects unexpected public session and chat fields", () => {
    expect(
      createWidgetSessionRequestSchema.safeParse({
        assistantId: "asst_public_example_123456",
        widgetVersion: "1.0.0",
        locale: "ru",
        providerKey: "secret",
      }).success,
    ).toBe(false);
    expect(
      widgetChatRequestSchema.safeParse({ message: "Вопрос", prompt: "override" }).success,
    ).toBe(false);
  });

  it("keeps prompt and provider details out of the session response", () => {
    const keys = widgetSessionResponseSchema.keyof().options;
    expect(keys).toEqual(["expiresAt", "config", "conversation"]);
    expect(keys).not.toContain("prompt");
    expect(keys).not.toContain("apiKey");
  });
});
