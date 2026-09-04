import { describe, expect, it, vi } from "vitest";

import { CrawlerError } from "../src/errors.js";
import { fetchSafeResource, type ResourceRequester } from "../src/safe-fetch.js";

const publicLookup = async () => [{ address: "93.184.216.34", family: 4 as const }];

describe("safe crawler fetch", () => {
  it("returns a bounded HTML response from the pinned public address", async () => {
    const request = vi.fn<ResourceRequester>(async () => ({
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
      body: "<h1>OK</h1>",
    }));
    const result = await fetchSafeResource({
      url: "https://shop.example/catalog/",
      allowedOrigin: "https://shop.example",
      isAllowedUrl: () => true,
      allowedContentTypes: ["text/html"],
      userAgent: "crawler-test",
      lookup: publicLookup,
      request,
    });
    expect(result.body).toContain("OK");
    expect(request.mock.calls[0]?.[1].address).toBe("93.184.216.34");
  });

  it("revalidates DNS after a redirect and blocks a rebinding answer", async () => {
    let lookups = 0;
    const request = vi.fn<ResourceRequester>(async () => ({
      status: 302,
      headers: { location: "/next" },
      body: "",
    }));
    await expect(
      fetchSafeResource({
        url: "https://shop.example/start",
        allowedOrigin: "https://shop.example",
        isAllowedUrl: () => true,
        allowedContentTypes: ["text/html"],
        userAgent: "crawler-test",
        lookup: async () => {
          lookups += 1;
          return [
            lookups === 1
              ? { address: "93.184.216.34", family: 4 as const }
              : { address: "127.0.0.1", family: 4 as const },
          ];
        },
        request,
      }),
    ).rejects.toMatchObject({ code: "CRAWL_ADDRESS_FORBIDDEN" });
    expect(request).toHaveBeenCalledOnce();
  });

  it("does not follow a redirect outside the configured origin", async () => {
    await expect(
      fetchSafeResource({
        url: "https://shop.example/start",
        allowedOrigin: "https://shop.example",
        isAllowedUrl: () => true,
        allowedContentTypes: ["text/html"],
        userAgent: "crawler-test",
        lookup: publicLookup,
        request: async () => ({
          status: 302,
          headers: { location: "http://127.0.0.1/private" },
          body: "",
        }),
      }),
    ).rejects.toMatchObject({ code: "CRAWL_URL_OUT_OF_SCOPE" });
  });

  it.each(["CRAWL_REQUEST_TIMEOUT", "CRAWL_RESPONSE_TOO_LARGE"])(
    "preserves the bounded request error %s",
    async (code) => {
      await expect(
        fetchSafeResource({
          url: "https://shop.example/start",
          allowedOrigin: "https://shop.example",
          isAllowedUrl: () => true,
          allowedContentTypes: ["text/html"],
          userAgent: "crawler-test",
          lookup: publicLookup,
          request: async () => {
            throw new CrawlerError(code, code === "CRAWL_REQUEST_TIMEOUT");
          },
        }),
      ).rejects.toMatchObject({ code });
    },
  );
});
