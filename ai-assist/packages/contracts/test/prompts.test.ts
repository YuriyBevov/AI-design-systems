import { describe, expect, it } from "vitest";

import {
  createPromptRequestSchema,
  createPromptRevisionRequestSchema,
  promptPreviewRequestSchema,
  promptPreviewResponseSchema,
  publishPromptRequestSchema,
  updatePromptRequestSchema,
} from "../src/index.js";

describe("prompt contracts", () => {
  it("accepts a bounded prompt and strips no content whitespace", () => {
    const parsed = createPromptRequestSchema.parse({
      name: "Основной prompt",
      content: "  Сохрани значимые отступы  ",
    });

    expect(parsed.type).toBe("system");
    expect(parsed.description).toBeNull();
    expect(parsed.content).toBe("  Сохрани значимые отступы  ");
  });

  it("requires optimistic versions for every update", () => {
    expect(updatePromptRequestSchema.safeParse({ name: "Новое имя" }).success).toBe(false);
    expect(createPromptRevisionRequestSchema.safeParse({ content: "Новая версия" }).success).toBe(
      false,
    );
    expect(
      publishPromptRequestSchema.safeParse({
        revisionId: "00000000-0000-4000-8000-000000000001",
      }).success,
    ).toBe(false);
  });

  it("rejects unknown mutation fields", () => {
    expect(
      createPromptRequestSchema.safeParse({
        name: "Prompt",
        content: "Content",
        projectId: "00000000-0000-4000-8000-000000000001",
      }).success,
    ).toBe(false);
  });

  it("accepts a bounded preview question for a saved revision", () => {
    expect(
      promptPreviewRequestSchema.parse({
        revisionId: "00000000-0000-4000-8000-000000000001",
        question: "  Что вы умеете?  ",
      }),
    ).toEqual({
      revisionId: "00000000-0000-4000-8000-000000000001",
      question: "Что вы умеете?",
    });
    expect(
      promptPreviewRequestSchema.safeParse({
        revisionId: "00000000-0000-4000-8000-000000000001",
        question: "x".repeat(4_001),
      }).success,
    ).toBe(false);
  });

  it("keeps preview diagnostics free of prompt and credential fields", () => {
    const response = promptPreviewResponseSchema.parse({
      promptId: "00000000-0000-4000-8000-000000000001",
      promptRevisionId: "00000000-0000-4000-8000-000000000002",
      promptRevisionNo: 2,
      configRevisionId: "00000000-0000-4000-8000-000000000003",
      configRevisionNo: 3,
      answer: "Тестовый ответ",
      model: {
        requestedId: "mock-chat",
        resolvedId: "mock-chat",
        maxOutputTokens: 500,
        temperature: 0.2,
      },
      finishReason: "stop",
      usage: { inputTokens: 20, outputTokens: 4 },
      latencyMs: 120,
      retrieval: {
        status: "empty",
        mode: "lexical",
        indexVersionId: null,
        warningCode: null,
        sources: [],
      },
    });

    expect(response).not.toHaveProperty("prompt");
    expect(response).not.toHaveProperty("credential");
  });
});
