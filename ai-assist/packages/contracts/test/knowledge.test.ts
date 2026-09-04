import { describe, expect, it } from "vitest";

import {
  createKnowledgeDocumentRequestSchema,
  createKnowledgeDocumentVersionRequestSchema,
  knowledgeIndexStateResponseSchema,
  knowledgeRetrievalSourceSchema,
} from "../src/knowledge.js";

describe("knowledge contracts", () => {
  it("accepts bounded manual and product documents", () => {
    expect(
      createKnowledgeDocumentRequestSchema.parse({
        type: "manual",
        title: "Доставка",
        content: "Доставляем заказы по России.",
        locale: "ru",
        tags: ["доставка", "доставка"],
      }).tags,
    ).toEqual(["доставка"]);
    const product = createKnowledgeDocumentRequestSchema.parse({
      type: "product",
      title: "Гофрокороб",
      content: "Короб из трёхслойного картона.",
      product: { sku: "BOX-1", currency: "rub", characteristics: { Цвет: "Бурый" } },
    });
    expect(product.type).toBe("product");
    if (product.type === "product") expect(product.product.currency).toBe("RUB");
  });

  it("rejects unsupported fields and unsafe source URL schemes", () => {
    expect(
      createKnowledgeDocumentRequestSchema.safeParse({
        type: "manual",
        title: "Секрет",
        content: "Текст",
        canonicalUrl: "javascript:alert(1)",
      }).success,
    ).toBe(false);
    expect(
      createKnowledgeDocumentRequestSchema.safeParse({
        type: "manual",
        title: "Документ",
        content: "Текст",
        apiKey: "not-allowed",
      }).success,
    ).toBe(false);
  });

  it("requires optimistic version for a new immutable version", () => {
    expect(
      createKnowledgeDocumentVersionRequestSchema.safeParse({
        type: "manual",
        title: "Доставка",
        content: "Новый текст",
      }).success,
    ).toBe(false);
  });

  it("bounds retrieval provenance", () => {
    expect(
      knowledgeRetrievalSourceSchema.safeParse({
        chunkId: "b85e04ac-c414-4262-88d8-6e15386a1b3d",
        documentId: "a85e04ac-c414-4262-88d8-6e15386a1b3d",
        documentVersionId: "c85e04ac-c414-4262-88d8-6e15386a1b3d",
        title: "Доставка",
        canonicalUrl: "https://example.test/delivery",
        excerpt: "Доставка по Москве.",
        score: 1.1,
      }).success,
    ).toBe(false);
  });

  it("describes an empty but configured vector index", () => {
    expect(
      knowledgeIndexStateResponseSchema.safeParse({
        configuredEmbeddingModelId: "embedding-model",
        active: null,
        latest: null,
        stale: true,
        publishedDocumentCount: 0,
        publishedChunkCount: 0,
      }).success,
    ).toBe(true);
  });
});
