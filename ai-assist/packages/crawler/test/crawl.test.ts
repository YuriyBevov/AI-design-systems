import { describe, expect, it, vi } from "vitest";

import { crawlWebsite } from "../src/crawl.js";
import type { ResourceRequester } from "../src/safe-fetch.js";

describe("website crawl", () => {
  it("fetches only explicitly targeted retry URLs", async () => {
    const requestedPages: string[] = [];
    const request = vi.fn<ResourceRequester>(async (url) => {
      if (url.pathname === "/robots.txt") {
        return { status: 200, headers: { "content-type": "text/plain" }, body: "" };
      }
      requestedPages.push(url.pathname);
      return {
        status: 200,
        headers: { "content-type": "text/html" },
        body: `<html><body><main><h1>${url.pathname}</h1><p>Retry page.</p></main></body></html>`,
      };
    });

    const result = await crawlWebsite({
      settings: {
        startUrl: "https://shop.example/",
        crawlMode: "full",
        includePathPrefixes: ["/catalog/"],
        includeExactPaths: [],
        excludePathPrefixes: [],
        maxPages: 2,
        maxDepth: 0,
        requestDelayMs: 0,
      },
      targetUrls: ["https://shop.example/failed-a/", "https://shop.example/failed-b/"],
      lookup: async () => [{ address: "93.184.216.34", family: 4 }],
      request,
      onPage: async () => undefined,
    });

    expect(result.processedCount).toBe(2);
    expect(requestedPages).toEqual(["/failed-a/", "/failed-b/"]);
  });

  it("uses sitemap discovery and deduplicates repeated product URLs", async () => {
    const request = vi.fn<ResourceRequester>(async (url) => {
      if (url.pathname === "/robots.txt") {
        return {
          status: 200,
          headers: { "content-type": "text/plain" },
          body: "User-agent: *\nDisallow: /private/\nSitemap: https://shop.example/sitemap.xml",
        };
      }
      if (url.pathname === "/sitemap.xml") {
        return {
          status: 200,
          headers: { "content-type": "application/xml" },
          body: `<urlset><url><loc>https://shop.example/catalog/box/</loc></url><url><loc>https://shop.example/catalog/box/</loc></url><url><loc>https://shop.example/private/secret/</loc></url></urlset>`,
        };
      }
      if (url.pathname === "/catalog/box/") {
        return {
          status: 200,
          headers: { "content-type": "text/html" },
          body: `<html><body><h1>Коробка</h1><article itemscope itemtype="http://schema.org/Product"><meta itemprop="sku" content="BOX-1"><meta itemprop="description" content="Коробка из картона"><meta itemprop="price" content="10"></article></body></html>`,
        };
      }
      return {
        status: 200,
        headers: { "content-type": "text/html" },
        body: `<html><body><main><h1>Магазин</h1><p>Производство картонной упаковки для бизнеса.</p></main></body></html>`,
      };
    });
    const pages: string[] = [];
    const result = await crawlWebsite({
      settings: {
        startUrl: "https://shop.example/",
        crawlMode: "limited",
        includePathPrefixes: ["/"],
        includeExactPaths: [],
        excludePathPrefixes: ["/private/"],
        maxPages: 5,
        maxDepth: 1,
        requestDelayMs: 0,
      },
      lookup: async () => [{ address: "93.184.216.34", family: 4 }],
      request,
      onPage: async (page) => {
        pages.push(page.normalizedUrl);
      },
    });
    expect(result.processedCount).toBe(2);
    expect(pages).toEqual(["https://shop.example/", "https://shop.example/catalog/box/"]);
    expect(pages).not.toContain("https://shop.example/private/secret/");
  });

  it("crawls only selected section pages when descendants are disabled", async () => {
    const request = vi.fn<ResourceRequester>(async (url) => {
      if (url.pathname === "/robots.txt") {
        return { status: 200, headers: { "content-type": "text/plain" }, body: "" };
      }
      if (url.pathname === "/sitemap.xml") {
        return {
          status: 200,
          headers: { "content-type": "application/xml" },
          body: `<urlset><url><loc>https://shop.example/about/</loc></url><url><loc>https://shop.example/about/team/</loc></url></urlset>`,
        };
      }
      return {
        status: 200,
        headers: { "content-type": "text/html" },
        body: `<html><body><main><h1>О компании</h1><p>Информация о компании и производстве.</p><a href="/about/team/">Команда</a></main></body></html>`,
      };
    });
    const pages: string[] = [];
    await crawlWebsite({
      settings: {
        startUrl: "https://shop.example/",
        crawlMode: "limited",
        includePathPrefixes: [],
        includeExactPaths: ["/about/"],
        excludePathPrefixes: [],
        maxPages: 5,
        maxDepth: 3,
        requestDelayMs: 0,
      },
      lookup: async () => [{ address: "93.184.216.34", family: 4 }],
      request,
      onPage: async (page) => {
        pages.push(page.normalizedUrl);
      },
    });
    expect(pages).toEqual(["https://shop.example/about/"]);
  });

  it("processes more than 100 pages in full-site mode", async () => {
    const sitemap = Array.from(
      { length: 125 },
      (_, index) => `<url><loc>https://shop.example/catalog/item-${index}/</loc></url>`,
    ).join("");
    const request = vi.fn<ResourceRequester>(async (url) => {
      if (url.pathname === "/robots.txt") {
        return { status: 200, headers: { "content-type": "text/plain" }, body: "" };
      }
      if (url.pathname === "/sitemap.xml") {
        return {
          status: 200,
          headers: { "content-type": "application/xml" },
          body: `<urlset>${sitemap}</urlset>`,
        };
      }
      return {
        status: 200,
        headers: { "content-type": "text/html" },
        body: `<html><body><main><h1>Страница каталога</h1><p>Описание товара для полной синхронизации каталога.</p></main></body></html>`,
      };
    });
    let pageCount = 0;
    const result = await crawlWebsite({
      settings: {
        startUrl: "https://shop.example/",
        crawlMode: "full",
        includePathPrefixes: ["/"],
        includeExactPaths: [],
        excludePathPrefixes: [],
        maxPages: 125,
        maxDepth: 0,
        requestDelayMs: 0,
      },
      lookup: async () => [{ address: "93.184.216.34", family: 4 }],
      request,
      onPage: async () => {
        pageCount += 1;
      },
    });
    expect(pageCount).toBe(125);
    expect(result.processedCount).toBe(125);
    expect(result.discoveredCount).toBe(126);
  });

  it("waits for the caller before fetching every page", async () => {
    const events: string[] = [];
    const request = vi.fn<ResourceRequester>(async (url) => {
      if (url.pathname === "/robots.txt") {
        return { status: 200, headers: { "content-type": "text/plain" }, body: "" };
      }
      if (url.pathname === "/sitemap.xml") {
        return {
          status: 200,
          headers: { "content-type": "application/xml" },
          body: "<urlset></urlset>",
        };
      }
      events.push(`fetch:${url.pathname}`);
      return {
        status: 200,
        headers: { "content-type": "text/html" },
        body: '<html><body><h1>Page</h1><a href="/second/">Second</a></body></html>',
      };
    });

    await crawlWebsite({
      settings: {
        startUrl: "https://shop.example/",
        crawlMode: "limited",
        includePathPrefixes: ["/"],
        includeExactPaths: [],
        excludePathPrefixes: [],
        maxPages: 2,
        maxDepth: 1,
        requestDelayMs: 0,
      },
      lookup: async () => [{ address: "93.184.216.34", family: 4 }],
      request,
      beforePage: async () => {
        events.push("ready");
      },
      onPage: async () => undefined,
    });

    expect(events).toEqual(["ready", "fetch:/", "ready", "fetch:/second/"]);
  });

  it("bounds parallel page fetches and processing independently", async () => {
    const sitemap = Array.from(
      { length: 10 },
      (_, index) => `<url><loc>https://shop.example/catalog/item-${index}/</loc></url>`,
    ).join("");
    let activeFetches = 0;
    let maxActiveFetches = 0;
    let activeProcessors = 0;
    let maxActiveProcessors = 0;
    const request = vi.fn<ResourceRequester>(async (url) => {
      if (url.pathname === "/robots.txt") {
        return { status: 200, headers: { "content-type": "text/plain" }, body: "" };
      }
      if (url.pathname === "/sitemap.xml") {
        return {
          status: 200,
          headers: { "content-type": "application/xml" },
          body: `<urlset>${sitemap}</urlset>`,
        };
      }
      activeFetches += 1;
      maxActiveFetches = Math.max(maxActiveFetches, activeFetches);
      await new Promise((resolve) => setTimeout(resolve, 10));
      activeFetches -= 1;
      return {
        status: 200,
        headers: { "content-type": "text/html" },
        body: `<html><body><main><h1>${url.pathname}</h1><p>Описание страницы.</p></main></body></html>`,
      };
    });

    const result = await crawlWebsite({
      settings: {
        startUrl: "https://shop.example/",
        crawlMode: "full",
        includePathPrefixes: ["/"],
        includeExactPaths: [],
        excludePathPrefixes: [],
        maxPages: 10,
        maxDepth: 0,
        requestDelayMs: 0,
      },
      lookup: async () => [{ address: "93.184.216.34", family: 4 }],
      request,
      fetchConcurrency: 2,
      processConcurrency: 5,
      onPage: async () => {
        activeProcessors += 1;
        maxActiveProcessors = Math.max(maxActiveProcessors, activeProcessors);
        await new Promise((resolve) => setTimeout(resolve, 80));
        activeProcessors -= 1;
      },
    });

    expect(result.processedCount).toBe(10);
    expect(maxActiveFetches).toBe(2);
    expect(maxActiveProcessors).toBe(5);
  });
});
