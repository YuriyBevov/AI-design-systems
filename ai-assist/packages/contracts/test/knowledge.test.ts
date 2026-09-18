import { describe, expect, it } from "vitest";

import {
  bulkKnowledgeDocumentsRequestSchema,
  clearKnowledgeDataRequestSchema,
  clearKnowledgeDataResponseSchema,
  controlKnowledgeProcessingRequestSchema,
  createKnowledgeDocumentRequestSchema,
  createKnowledgeDocumentVersionRequestSchema,
  knowledgeIndexStateResponseSchema,
  knowledgeRetrievalSourceSchema,
  knowledgeProcessingRunHistoryResponseSchema,
  requestKnowledgeProcessingSchema,
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

  it("requires an explicit data-cleanup scope and returns deletion counts", () => {
    expect(clearKnowledgeDataRequestSchema.parse({ scope: "all" })).toEqual({ scope: "all" });
    expect(clearKnowledgeDataRequestSchema.parse({ scope: "sources" })).toEqual({
      scope: "sources",
    });
    expect(clearKnowledgeDataRequestSchema.safeParse({ scope: "everything" }).success).toBe(false);
    expect(
      clearKnowledgeDataResponseSchema.safeParse({
        deletedCrawlRuns: 4,
        deletedDocuments: 12,
        deletedIndexVersions: 2,
        deletedSources: 3,
        preservedDocuments: 7,
      }).success,
    ).toBe(true);
  });

  it("validates deduplicated bulk document actions", () => {
    const documentId = "a85e04ac-c414-4262-88d8-6e15386a1b3d";
    expect(
      bulkKnowledgeDocumentsRequestSchema.parse({
        action: "publish",
        documentIds: [documentId, documentId],
      }).documentIds,
    ).toEqual([documentId]);
    expect(
      bulkKnowledgeDocumentsRequestSchema.safeParse({ action: "archive", documentIds: [] }).success,
    ).toBe(false);
  });

  it("requires a bounded post-processing instruction and explicit selection scope", () => {
    const documentId = "a85e04ac-c414-4262-88d8-6e15386a1b3d";
    expect(
      requestKnowledgeProcessingSchema.parse({
        instruction: "Удалите рекламные призывы, сохранив факты и характеристики.",
        selection: { scope: "selected", documentIds: [documentId, documentId] },
      }).selection,
    ).toEqual({ scope: "selected", documentIds: [documentId] });
    expect(
      requestKnowledgeProcessingSchema.safeParse({
        instruction: "Слишком коротко",
        selection: { scope: "all" },
      }).success,
    ).toBe(false);
  });

  it("validates post-processing control and history states", () => {
    expect(controlKnowledgeProcessingRequestSchema.parse({ paused: true })).toEqual({
      paused: true,
    });
    expect(
      controlKnowledgeProcessingRequestSchema.safeParse({ paused: true, stop: true }).success,
    ).toBe(false);
    expect(
      knowledgeProcessingRunHistoryResponseSchema.safeParse({
        runs: [
          {
            id: "c85e04ac-c414-4262-88d8-6e15386a1b3d",
            projectId: "a85e04ac-c414-4262-88d8-6e15386a1b3d",
            status: "cancelled",
            instruction: "Удалите рекламные призывы, сохранив подтверждённые факты.",
            totalCount: 20,
            processedCount: 7,
            succeededCount: 6,
            failedCount: 1,
            paused: false,
            errorCode: null,
            requestedByEmail: null,
            requestId: "req-test",
            startedAt: "2026-09-18T07:00:00.000Z",
            finishedAt: "2026-09-18T07:10:00.000Z",
            createdAt: "2026-09-18T06:59:00.000Z",
            updatedAt: "2026-09-18T07:10:00.000Z",
          },
        ],
      }).success,
    ).toBe(true);
  });
});
