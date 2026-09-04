import { describe, expect, it } from "vitest";

import { parseRobots } from "../src/robots.js";

describe("robots policy", () => {
  it("uses the most specific matching rule and preserves sitemap/delay", () => {
    const policy = parseRobots(`
      User-agent: *
      Disallow: /catalog/private/
      Allow: /catalog/private/public/
      Crawl-delay: 1.5
      Sitemap: https://shop.example/sitemap.xml
    `);
    expect(policy.allows(new URL("https://shop.example/catalog/box/"))).toBe(true);
    expect(policy.allows(new URL("https://shop.example/catalog/private/item/"))).toBe(false);
    expect(policy.allows(new URL("https://shop.example/catalog/private/public/item/"))).toBe(true);
    expect(policy.crawlDelayMs).toBe(1_500);
    expect(policy.sitemapUrls).toEqual(["https://shop.example/sitemap.xml"]);
  });

  it("prefers the crawler-specific group over the wildcard group", () => {
    const policy = parseRobots(`
      User-agent: *
      Disallow: /

      User-agent: ai-assist-crawler
      Allow: /
    `);
    expect(policy.allows(new URL("https://shop.example/catalog/"))).toBe(true);
  });
});
