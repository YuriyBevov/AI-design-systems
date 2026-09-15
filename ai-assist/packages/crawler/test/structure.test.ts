import { describe, expect, it, vi } from "vitest";

import type { ResourceRequester } from "../src/safe-fetch.js";
import { discoverSiteStructure } from "../src/structure.js";

describe("site structure discovery", () => {
  it("returns a nested tree combined from home navigation and sitemap", async () => {
    const request = vi.fn<ResourceRequester>(async (url) => {
      if (url.pathname === "/robots.txt") {
        return {
          status: 200,
          headers: { "content-type": "text/plain" },
          body: "Sitemap: https://shop.example/sitemap.xml",
        };
      }
      if (url.pathname === "/sitemap.xml") {
        return {
          status: 200,
          headers: { "content-type": "application/xml" },
          body: `<urlset>
            <url><loc>https://shop.example/catalog/</loc></url>
            <url><loc>https://shop.example/catalog/box/</loc></url>
            <url><loc>https://shop.example/delivery/</loc></url>
          </urlset>`,
        };
      }
      return {
        status: 200,
        headers: { "content-type": "text/html" },
        body: `<nav>
          <a href="/catalog/">Каталог продукции</a>
          <a href="/catalog/box/">Коробки</a>
          <a href="/about/">О компании</a>
          <a href="https://external.example/news/">Внешний сайт</a>
        </nav>`,
      };
    });

    const result = await discoverSiteStructure({
      startUrl: "https://shop.example/",
      maxDepth: 4,
      requestDelayMs: 0,
      lookup: async () => [{ address: "93.184.216.34", family: 4 }],
      request,
    });

    expect(result.method).toBe("mixed");
    expect(result.nodes.map((node) => node.path)).toEqual(["/catalog/", "/about/", "/delivery/"]);
    expect(result.nodes[0]).toMatchObject({
      label: "Каталог продукции",
      descendantCount: 1,
      source: "both",
    });
    expect(result.nodes[0]?.children.map((node) => node.path)).toEqual(["/catalog/box/"]);
  });
});
