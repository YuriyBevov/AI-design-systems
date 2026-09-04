import { describe, expect, it } from "vitest";

import {
  createUrlKnowledgeSourceRequestSchema,
  crawlRunPagesQuerySchema,
  discoverSiteStructureResponseSchema,
  knowledgeCrawlJobDataSchema,
  publishCrawlRunRequestSchema,
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

  it("validates a bounded first-level site structure", () => {
    expect(
      discoverSiteStructureResponseSchema.safeParse({
        origin: "https://shop.example",
        method: "mixed",
        sections: [
          {
            path: "/catalog/",
            url: "https://shop.example/catalog/",
            label: "Каталог",
            descendantCount: 42,
            source: "both",
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
    expect(knowledgeCrawlJobDataSchema.safeParse({ ...payload, apiKey: "forbidden" }).success).toBe(
      false,
    );
  });
});
