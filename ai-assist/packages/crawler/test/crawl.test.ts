import { describe, expect, it, vi } from "vitest";

import { crawlWebsite } from "../src/crawl.js";
import type { ResourceRequester } from "../src/safe-fetch.js";

describe("website crawl", () => {
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
});
