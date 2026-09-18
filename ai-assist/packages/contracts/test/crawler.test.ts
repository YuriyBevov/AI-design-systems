import { describe, expect, it } from "vitest";

import {
  createUrlKnowledgeSourceRequestSchema,
  crawlRunPagesQuerySchema,
  crawlRunHistoryResponseSchema,
  controlKnowledgeCrawlRequestSchema,
  deleteKnowledgeCrawlResponseSchema,
  deleteUrlKnowledgeSourceQuerySchema,
  deleteUrlKnowledgeSourceResponseSchema,
  defaultKnowledgeNormalizationPrompt,
  discoverSiteStructureResponseSchema,
  knowledgeCrawlJobDataSchema,
  knowledgeCrawlJobResultSchema,
  publishCrawlRunRequestSchema,
  reprocessKnowledgeCrawlRequestSchema,
} from "../src/crawler.js";

describe("crawler contracts", () => {
  it("accepts bounded URL source settings", () => {
    const parsed = createUrlKnowledgeSourceRequestSchema.parse({
      name: "Сайт магазина",
      settings: { startUrl: "https://gofroprodpak.ru/" },
    });
    expect(parsed.settings.maxPages).toBe(25);
    expect(parsed.settings.crawlMode).toBe("limited");
    expect(parsed.settings.includePathPrefixes).toEqual(["/"]);
    expect(parsed.settings.includeExactPaths).toEqual([]);
    expect(parsed.settings.normalizationPrompt).toBe(defaultKnowledgeNormalizationPrompt);
  });

  it("supports exact section pages and selected crawl-page publication", () => {
    const source = createUrlKnowledgeSourceRequestSchema.safeParse({
      name: "Разделы магазина",
      settings: {
        startUrl: "https://shop.example/",
        includePathPrefixes: ["/catalog/"],
        includeExactPaths: ["/delivery/"],
      },
    });
    expect(source.success).toBe(true);
    expect(
      publishCrawlRunRequestSchema.safeParse({
        selection: "selected",
        pageIds: ["a85e04ac-c414-4262-88d8-6e15386a1b3d"],
      }).success,
    ).toBe(true);
    expect(
      publishCrawlRunRequestSchema.safeParse({ selection: "selected", pageIds: [] }).success,
    ).toBe(false);
    expect(publishCrawlRunRequestSchema.safeParse({ selection: "all" }).success).toBe(true);
  });

  it("allows a bounded full crawl while keeping the quick mode small", () => {
    const base = {
      name: "Полный сайт",
      settings: { startUrl: "https://shop.example/", maxPages: 2_000 },
    };
    expect(createUrlKnowledgeSourceRequestSchema.safeParse(base).success).toBe(false);
    expect(
      createUrlKnowledgeSourceRequestSchema.safeParse({
        ...base,
        settings: { ...base.settings, crawlMode: "full" },
      }).success,
    ).toBe(true);
    expect(
      createUrlKnowledgeSourceRequestSchema.safeParse({
        ...base,
        settings: { ...base.settings, crawlMode: "full", maxPages: 5_001 },
      }).success,
    ).toBe(false);
  });

  it("bounds crawl result pagination", () => {
    expect(crawlRunPagesQuerySchema.parse({ page: "2", pageSize: "100" })).toEqual({
      page: 2,
      pageSize: 100,
    });
    expect(crawlRunPagesQuerySchema.safeParse({ page: 1, pageSize: 101 }).success).toBe(false);
  });

  it("validates a bounded nested site structure", () => {
    expect(
      discoverSiteStructureResponseSchema.safeParse({
        origin: "https://shop.example",
        method: "mixed",
        nodes: [
          {
            path: "/catalog/",
            url: "https://shop.example/catalog/",
            label: "Каталог",
            depth: 1,
            descendantCount: 42,
            source: "both",
            children: [],
          },
        ],
      }).success,
    ).toBe(true);
  });

  it("accepts large catalog branches returned by sitemap discovery", () => {
    const children = Array.from({ length: 501 }, (_, index) => ({
      path: `/catalog/product-${index}/`,
      url: `https://shop.example/catalog/product-${index}/`,
      label: `Product ${index}`,
      depth: 2,
      descendantCount: 0,
      source: "sitemap" as const,
      children: [],
    }));
    expect(
      discoverSiteStructureResponseSchema.safeParse({
        origin: "https://shop.example",
        method: "sitemap",
        nodes: [
          {
            path: "/catalog/",
            url: "https://shop.example/catalog/",
            label: "Catalog",
            depth: 1,
            descendantCount: children.length,
            source: "sitemap",
            children,
          },
        ],
      }).success,
    ).toBe(true);
  });

  it("rejects credentials, fragments and excessive crawl limits", () => {
    expect(
      createUrlKnowledgeSourceRequestSchema.safeParse({
        name: "Небезопасный источник",
        settings: { startUrl: "https://user:pass@example.com/#secret", maxPages: 1_000 },
      }).success,
    ).toBe(false);
  });

  it("keeps crawl queue payload identifier-only", () => {
    const payload = {
      projectId: "a85e04ac-c414-4262-88d8-6e15386a1b3d",
      sourceId: "b85e04ac-c414-4262-88d8-6e15386a1b3d",
      runId: "c85e04ac-c414-4262-88d8-6e15386a1b3d",
      requestedAt: "2026-09-02T12:00:00.000Z",
      requestId: "req-crawl",
    };
    expect(knowledgeCrawlJobDataSchema.safeParse(payload).success).toBe(true);
    expect(knowledgeCrawlJobDataSchema.parse(payload).rawSourceRunId).toBeNull();
    expect(knowledgeCrawlJobDataSchema.parse(payload).targetUrl).toBeNull();
    expect(knowledgeCrawlJobDataSchema.parse(payload).failedSourceRunId).toBeNull();
    expect(
      knowledgeCrawlJobDataSchema.safeParse({
        ...payload,
        targetUrl: "https://shop.example/catalog/box/",
      }).success,
    ).toBe(true);
    expect(
      knowledgeCrawlJobDataSchema.safeParse({
        ...payload,
        failedSourceRunId: "d85e04ac-c414-4262-88d8-6e15386a1b3d",
      }).success,
    ).toBe(true);
    expect(
      knowledgeCrawlJobDataSchema.safeParse({
        ...payload,
        targetUrl: "https://shop.example/catalog/box/",
        failedSourceRunId: "d85e04ac-c414-4262-88d8-6e15386a1b3d",
      }).success,
    ).toBe(false);
    expect(knowledgeCrawlJobDataSchema.safeParse({ ...payload, apiKey: "forbidden" }).success).toBe(
      false,
    );
  });

  it("accepts only an explicit crawl pause state", () => {
    expect(controlKnowledgeCrawlRequestSchema.parse({ paused: true })).toEqual({ paused: true });
    expect(
      controlKnowledgeCrawlRequestSchema.safeParse({ paused: false, force: true }).success,
    ).toBe(false);
  });

  it("accepts the terminal crawl deletion response", () => {
    expect(deleteKnowledgeCrawlResponseSchema.parse({ deleted: true })).toEqual({ deleted: true });
    expect(deleteKnowledgeCrawlResponseSchema.safeParse({ deleted: false }).success).toBe(false);
  });

  it("validates source deletion concurrency and preservation counts", () => {
    expect(deleteUrlKnowledgeSourceQuerySchema.parse({ expectedVersion: "3" })).toEqual({
      expectedVersion: 3,
    });
    expect(
      deleteUrlKnowledgeSourceResponseSchema.safeParse({
        id: "b85e04ac-c414-4262-88d8-6e15386a1b3d",
        deleted: true,
        deletedCrawlRuns: 2,
        preservedDocuments: 12,
      }).success,
    ).toBe(true);
  });

  it("returns source-labelled crawl history", () => {
    expect(
      crawlRunHistoryResponseSchema.safeParse({
        runs: [
          {
            id: "c85e04ac-c414-4262-88d8-6e15386a1b3d",
            projectId: "a85e04ac-c414-4262-88d8-6e15386a1b3d",
            sourceId: "b85e04ac-c414-4262-88d8-6e15386a1b3d",
            sourceName: "Каталог",
            status: "failed",
            discoveredCount: 1,
            processedCount: 1,
            succeededCount: 0,
            failedCount: 1,
            newCount: 0,
            changedCount: 0,
            unchangedCount: 0,
            approvedCount: 0,
            profileVersion: "raw-ai-v1",
            paused: false,
            normalizationPrompt: defaultKnowledgeNormalizationPrompt,
            errorCode: "PROVIDER_TIMEOUT",
            requestedByEmail: null,
            requestId: "request-1",
            startedAt: "2026-09-16T10:00:00.000Z",
            finishedAt: "2026-09-16T10:01:00.000Z",
            createdAt: "2026-09-16T10:00:00.000Z",
            updatedAt: "2026-09-16T10:01:00.000Z",
          },
        ],
      }).success,
    ).toBe(true);
  });

  it("accepts a cooperative crawl cancellation result", () => {
    expect(
      knowledgeCrawlJobResultSchema.safeParse({
        runId: "c85e04ac-c414-4262-88d8-6e15386a1b3d",
        projectId: "a85e04ac-c414-4262-88d8-6e15386a1b3d",
        status: "cancelled",
        processedCount: 2,
        succeededCount: 1,
        failedCount: 1,
      }).success,
    ).toBe(true);
  });

  it("accepts only a bounded prompt for repeated AI processing", () => {
    const expectedSourceVersion = 2;
    expect(
      reprocessKnowledgeCrawlRequestSchema.safeParse({
        expectedSourceVersion,
        normalizationPrompt: defaultKnowledgeNormalizationPrompt,
      }).success,
    ).toBe(true);
    expect(
      reprocessKnowledgeCrawlRequestSchema.safeParse({
        expectedSourceVersion,
        normalizationPrompt: "Коротко",
      }).success,
    ).toBe(false);
    expect(
      reprocessKnowledgeCrawlRequestSchema.safeParse({
        expectedSourceVersion,
        normalizationPrompt: defaultKnowledgeNormalizationPrompt,
        systemPrompt: "forbidden",
      }).success,
    ).toBe(false);
  });
});
