import http from "node:http";
import https from "node:https";

import { CrawlerError } from "./errors.js";
import {
  defaultDnsLookup,
  normalizeCrawlUrl,
  resolvePublicUrl,
  type DnsLookup,
  type ResolvedAddress,
} from "./url-policy.js";

export type ResourceResponse = {
  status: number;
  headers: Record<string, string>;
  body: string;
};

export type ResourceRequester = (
  url: URL,
  address: ResolvedAddress,
  input: { userAgent: string; timeoutMs: number; maxBytes: number },
) => Promise<ResourceResponse>;

const defaultResourceRequester: ResourceRequester = (url, address, input) =>
  new Promise((resolve, reject) => {
    const transport = url.protocol === "https:" ? https : http;
    let settled = false;
    const fail = (error: unknown): void => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    const request = transport.request(
      {
        protocol: url.protocol,
        hostname: address.address,
        family: address.family,
        port: url.port || (url.protocol === "https:" ? 443 : 80),
        path: `${url.pathname}${url.search}`,
        method: "GET",
        servername: url.hostname,
        maxHeaderSize: 16_384,
        headers: {
          accept: "text/html,application/xhtml+xml,application/xml,text/xml,text/plain;q=0.8",
          "accept-encoding": "identity",
          host: url.host,
          "user-agent": input.userAgent,
        },
      },
      (response) => {
        const chunks: Buffer[] = [];
        let totalBytes = 0;
        response.on("data", (chunk: Buffer) => {
          totalBytes += chunk.length;
          if (totalBytes > input.maxBytes) {
            response.destroy(new CrawlerError("CRAWL_RESPONSE_TOO_LARGE"));
            return;
          }
          chunks.push(chunk);
        });
        response.on("error", fail);
        response.on("end", () => {
          if (settled) return;
          settled = true;
          const headers = Object.fromEntries(
            Object.entries(response.headers).flatMap(([key, value]) => {
              if (typeof value === "string") return [[key, value]];
              if (Array.isArray(value)) return [[key, value.join(", ")]];
              return [];
            }),
          );
          resolve({
            status: response.statusCode ?? 0,
            headers,
            body: Buffer.concat(chunks).toString("utf8"),
          });
        });
      },
    );
    request.setTimeout(input.timeoutMs, () => {
      request.destroy(new CrawlerError("CRAWL_REQUEST_TIMEOUT", true));
    });
    request.on("error", fail);
    request.end();
  });

export const fetchSafeResource = async (input: {
  url: string | URL;
  allowedOrigin: string;
  isAllowedUrl: (url: URL) => boolean;
  allowedContentTypes: string[];
  userAgent: string;
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  lookup?: DnsLookup;
  request?: ResourceRequester;
}): Promise<ResourceResponse & { finalUrl: URL; contentType: string | null }> => {
  const lookup = input.lookup ?? defaultDnsLookup;
  const request = input.request ?? defaultResourceRequester;
  const maxRedirects = input.maxRedirects ?? 4;
  let current = normalizeCrawlUrl(input.url);
  const visited = new Set<string>();

  for (let redirect = 0; redirect <= maxRedirects; redirect += 1) {
    if (current.origin !== input.allowedOrigin || !input.isAllowedUrl(current)) {
      throw new CrawlerError("CRAWL_URL_OUT_OF_SCOPE");
    }
    if (visited.has(current.href)) throw new CrawlerError("CRAWL_REDIRECT_LOOP");
    visited.add(current.href);
    const resolved = await resolvePublicUrl(current, lookup);
    let response: ResourceResponse | null = null;
    let lastRequestError: CrawlerError | null = null;
    for (const address of resolved.addresses) {
      try {
        response = await request(resolved.url, address, {
          userAgent: input.userAgent,
          timeoutMs: input.timeoutMs ?? 12_000,
          maxBytes: input.maxBytes ?? 2_000_000,
        });
        break;
      } catch (error) {
        const requestError =
          error instanceof CrawlerError ? error : new CrawlerError("CRAWL_REQUEST_FAILED", true);
        if (!requestError.retryable) throw requestError;
        lastRequestError = requestError;
      }
    }
    if (!response) throw lastRequestError ?? new CrawlerError("CRAWL_REQUEST_FAILED", true);
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.location;
      if (!location) throw new CrawlerError("CRAWL_REDIRECT_LOCATION_MISSING");
      current = normalizeCrawlUrl(new URL(location, current));
      continue;
    }
    const contentType =
      response.headers["content-type"]?.split(";", 1)[0]?.trim().toLowerCase() ?? null;
    if (
      response.status >= 200 &&
      response.status < 300 &&
      (!contentType || !input.allowedContentTypes.includes(contentType))
    ) {
      throw new CrawlerError("CRAWL_CONTENT_TYPE_FORBIDDEN");
    }
    return { ...response, finalUrl: current, contentType };
  }
  throw new CrawlerError("CRAWL_REDIRECT_LIMIT");
};
