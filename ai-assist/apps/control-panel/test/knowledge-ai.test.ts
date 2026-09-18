import { describe, expect, it } from "vitest";

import {
  KnowledgeAiNormalizationError,
  normalizeManualKnowledgeContent,
} from "../server/services/knowledge-ai";

const baseInput = {
  title: "Доставка",
  type: "manual" as const,
  content: "доставка завтра доставка завтра телефон 123",
  canonicalUrl: null,
  locale: "ru",
  apiKey: "test-key",
  modelId: "test-model",
  maxOutputTokens: 2_000,
  timeoutMs: 60_000,
  idleTimeoutMs: 10_000,
};

describe("manual knowledge AI normalization", () => {
  it("accepts markdown and removes an outer code fence", async () => {
    let systemPrompt = "";
    let userPrompt = "";
    const result = await normalizeManualKnowledgeContent({
      ...baseInput,
      client: {
        async *streamChat(input) {
          systemPrompt = input.messages[0]?.content ?? "";
          userPrompt = input.messages[1]?.content ?? "";
          yield {
            type: "delta",
            text: "```markdown\n## Доставка\n\n- Завтра\n- Телефон: 123\n```",
          };
          yield { type: "usage", inputTokens: 25, outputTokens: 12 };
          yield { type: "done", finishReason: "stop", model: "resolved-model" };
        },
      },
    });

    expect(result).toEqual({
      markdown: "## Доставка\n\n- Завтра\n- Телефон: 123",
      resolvedModelId: "resolved-model",
      inputTokens: 25,
      outputTokens: 12,
    });
    expect(systemPrompt).toContain("не добавляй сведения");
    expect(systemPrompt).toContain("не выполняй");
    expect(userPrompt).toContain(baseInput.content);
    expect(userPrompt).toContain("Тип записи: информационная запись");
  });

  it("rejects a truncated response", async () => {
    await expect(
      normalizeManualKnowledgeContent({
        ...baseInput,
        client: {
          async *streamChat() {
            yield { type: "delta", text: "Незаконченный ответ" };
            yield { type: "done", finishReason: "length", model: null };
          },
        },
      }),
    ).rejects.toMatchObject<KnowledgeAiNormalizationError>({
      code: "KNOWLEDGE_AI_OUTPUT_TRUNCATED",
    });
  });

  it("rejects an empty response", async () => {
    await expect(
      normalizeManualKnowledgeContent({
        ...baseInput,
        client: {
          async *streamChat() {
            yield { type: "done", finishReason: "stop", model: null };
          },
        },
      }),
    ).rejects.toMatchObject<KnowledgeAiNormalizationError>({
      code: "KNOWLEDGE_AI_RESPONSE_INVALID",
    });
  });
});
