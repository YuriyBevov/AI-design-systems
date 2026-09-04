import { describe, expect, it } from "vitest";

import { CrawlerError } from "../src/errors.js";
import { isUrlInScope, resolvePublicUrl } from "../src/url-policy.js";

describe("crawler URL policy", () => {
  it("accepts a hostname only when every DNS answer is public", async () => {
    const result = await resolvePublicUrl("https://shop.example/catalog/", async () => [
      { address: "93.184.216.34", family: 4 },
      { address: "2606:2800:220:1:248:1893:25c8:1946", family: 6 },
    ]);
    expect(result.url.toString()).toBe("https://shop.example/catalog/");
    expect(result.addresses).toHaveLength(2);

    await expect(
      resolvePublicUrl("https://shop.example/", async () => [
        { address: "93.184.216.34", family: 4 },
        { address: "10.0.0.8", family: 4 },
      ]),
    ).rejects.toMatchObject({ code: "CRAWL_ADDRESS_FORBIDDEN" });
  });

  it.each([
    "http://localhost/",
    "http://127.0.0.1/",
    "http://2130706433/",
    "http://0x7f000001/",
    "http://[::1]/",
    "http://169.254.169.254/latest/meta-data/",
    "http://192.168.1.2/",
  ])("blocks a local, private or alternate-format address: %s", async (url) => {
    await expect(resolvePublicUrl(url)).rejects.toBeInstanceOf(CrawlerError);
  });

  it("rejects credentials and non-default ports", async () => {
    await expect(resolvePublicUrl("https://user:pass@example.com/")).rejects.toMatchObject({
      code: "CRAWL_URL_CREDENTIALS_FORBIDDEN",
    });
    await expect(resolvePublicUrl("https://example.com:8443/")).rejects.toMatchObject({
      code: "CRAWL_URL_PORT_FORBIDDEN",
    });
  });

  it("treats trailing slashes as equivalent for an exact selected section", () => {
    const scope = {
      origin: "https://shop.example",
      includePathPrefixes: [],
      includeExactPaths: ["/about/"],
      excludePathPrefixes: [],
    };
    expect(isUrlInScope(new URL("https://shop.example/about"), scope)).toBe(true);
    expect(isUrlInScope(new URL("https://shop.example/about/team/"), scope)).toBe(false);
  });
});
