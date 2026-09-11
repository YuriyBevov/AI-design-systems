import { describe, expect, it } from "vitest";

import { requiresKnowledgeModelReindex } from "../app/utils/knowledge-index";

describe("requiresKnowledgeModelReindex", () => {
  it("requires an index after selecting a model for published knowledge", () => {
    expect(
      requiresKnowledgeModelReindex({
        configuredEmbeddingModelId: "embedding-next",
        active: null,
      }),
    ).toBe(true);
  });

  it("requires reindexing when the configured model differs from the active index", () => {
    expect(
      requiresKnowledgeModelReindex({
        configuredEmbeddingModelId: "embedding-next",
        active: { embeddingModelId: "embedding-current" },
      }),
    ).toBe(true);
  });

  it("does not require model reindexing for the current model", () => {
    expect(
      requiresKnowledgeModelReindex({
        configuredEmbeddingModelId: "embedding-current",
        active: { embeddingModelId: "embedding-current" },
      }),
    ).toBe(false);
  });

  it("does not prompt before a model is selected", () => {
    expect(
      requiresKnowledgeModelReindex({
        configuredEmbeddingModelId: null,
        active: null,
      }),
    ).toBe(false);
  });

  it("requires the first index immediately after a model is selected", () => {
    expect(
      requiresKnowledgeModelReindex({
        configuredEmbeddingModelId: "embedding-current",
        active: null,
      }),
    ).toBe(true);
  });
});
