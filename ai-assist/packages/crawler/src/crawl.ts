import { load } from "cheerio";

import { crawlerUserAgent } from "./constants.js";
import { CrawlerError, toCrawlerError } from "./errors.js";
import { extractHtmlPage, type ExtractedPage } from "./extract.js";
import { parseRobots } from "./robots.js";
import { fetchSafeResource, type ResourceRequester } from "./safe-fetch.js";
import {
  defaultDnsLookup,
  isUrlInScope,
  normalizeCrawlUrl,
  resolvePublicUrl,
  type DnsLookup,
} from "./url-policy.js";

export type CrawlSettings = {
  startUrl: string;
  crawlMode: "limited" | "full";
  includePathPrefixes: string[];
  includeExactPaths: string[];
  excludePathPrefixes: string[];
  maxPages: number;
  maxDepth: number;
  requestDelayMs: number;
};

export type CrawlPageResult = {
  normalizedUrl: string;
  depth: number;
  status: "succeeded" | "failed" | "skipped";
  httpStatus: number | null;
  contentType: string | null;
  extracted: ExtractedPage | null;
  errorCode: string | null;
  retryable: boolean;
  fetchedAt: Date | null;
};

const htmlContentTypes = ["text/html", "application/xhtml+xml"];
const robotsContentTypes = ["text/plain", "text/html"];
const sitemapContentTypes = ["application/xml", "text/xml", "text/plain", "application/rss+xml"];
export { crawlerUserAgent } from "./constants.js";

const wait = async (milliseconds: number): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
};

const sitemapPriority = (url: URL): number => {
  if (url.pathname.startsWith("/catalog/") && url.pathname.split("/").filter(Boolean).length > 2) {
    return 0;
  }
  if (/\/(delivery|payment|contacts?|company|about)\/?$/i.test(url.pathname)) return 1;
  if (url.pathname.startsWith("/catalog/")) return 2;
  return 3;
};

export const validateCrawlSource = async (
  settings: CrawlSettings,
  lookup: DnsLookup = defaultDnsLookup,
): Promise<{ startUrl: string; origin: string }> => {
  const resolved = await resolvePublicUrl(settings.startUrl, lookup);
  return { startUrl: resolved.url.toString(), origin: resolved.url.origin };
};

export const crawlWebsite = async (input: {
  settings: CrawlSettings;
  onPage: (page: CrawlPageResult, discoveredCount: number) => Promise<void>;
  lookup?: DnsLookup;
  request?: ResourceRequester;
}): Promise<{ discoveredCount: number; processedCount: number; profileVersion: string }> => {
  const lookup = input.lookup ?? defaultDnsLookup;
  const validated = await validateCrawlSource(input.settings, lookup);
  const scope = {
    origin: validated.origin,
    includePathPrefixes: input.settings.includePathPrefixes,
    includeExactPaths: input.settings.includeExactPaths,
    excludePathPrefixes: input.settings.excludePathPrefixes,
  };
  let effectiveDelayMs = input.settings.requestDelayMs;
  const isScoped = (url: URL): boolean => isUrlInScope(url, scope);
  const fetchResource = async (
    url: string | URL,
    allowedContentTypes: string[],
    isAllowedUrl = isScoped,
  ) => {
    await wait(effectiveDelayMs);
    return fetchSafeResource({
      url,
      allowedOrigin: validated.origin,
      isAllowedUrl,
      allowedContentTypes,
      userAgent: crawlerUserAgent,
      lookup,
      ...(input.request ? { request: input.request } : {}),
    });
  };

  const robotsUrl = new URL("/robots.txt", validated.origin);
  const robotsResponse = await fetchResource(
    robotsUrl,
    robotsContentTypes,
    (url) => url.origin === validated.origin && url.pathname === "/robots.txt",
  );
  if (
    robotsResponse.status !== 404 &&
    (robotsResponse.status < 200 || robotsResponse.status >= 300)
  ) {
    throw new CrawlerError("CRAWL_ROBOTS_UNAVAILABLE", true);
  }
  const robots = parseRobots(robotsResponse.status === 404 ? "" : robotsResponse.body);
  effectiveDelayMs = Math.max(effectiveDelayMs, robots.crawlDelayMs);
  const start = normalizeCrawlUrl(validated.startUrl);
  if (isScoped(start) && !robots.allows(start)) {
    throw new CrawlerError("CRAWL_START_URL_ROBOTS_FORBIDDEN");
  }

  const sitemapSeeds = [
    ...robots.sitemapUrls,
    new URL("/sitemap.xml", validated.origin).toString(),
  ];
  const sitemapQueue = [...new Set(sitemapSeeds)];
  const visitedSitemaps = new Set<string>();
  const sitemapPages = new Map<string, URL>();
  const sitemapLimit =
    input.settings.crawlMode === "full"
      ? Math.min(10_000, Math.max(input.settings.maxPages * 2, 2_000))
      : 2_000;
  const sitemapFileLimit = input.settings.crawlMode === "full" ? 50 : 8;
  while (
    sitemapQueue.length &&
    visitedSitemaps.size < sitemapFileLimit &&
    sitemapPages.size < sitemapLimit
  ) {
    const sitemapValue = sitemapQueue.shift()!;
    let sitemapUrl: URL;
    try {
      sitemapUrl = normalizeCrawlUrl(sitemapValue);
    } catch {
      continue;
    }
    if (sitemapUrl.origin !== validated.origin || visitedSitemaps.has(sitemapUrl.href)) continue;
    visitedSitemaps.add(sitemapUrl.href);
    let response;
    try {
      response = await fetchResource(
        sitemapUrl,
        sitemapContentTypes,
        (url) => url.origin === validated.origin && /sitemap[^/]*\.xml$/i.test(url.pathname),
      );
    } catch {
      continue;
    }
    if (response.status < 200 || response.status >= 300) continue;
    const $ = load(response.body, { xmlMode: true });
    $("sitemap > loc").each((_, element) => {
      if (sitemapQueue.length + visitedSitemaps.size < 100)
        sitemapQueue.push($(element).text().trim());
    });
    $("url > loc").each((_, element) => {
      if (sitemapPages.size >= sitemapLimit) return;
      try {
        const url = normalizeCrawlUrl($(element).text().trim());
        if (isScoped(url) && robots.allows(url)) sitemapPages.set(url.href, url);
      } catch {
        // Invalid sitemap URLs are ignored and never fetched.
      }
    });
  }

  const prioritized = [...sitemapPages.values()].sort(
    (left, right) =>
      sitemapPriority(left) - sitemapPriority(right) || left.href.localeCompare(right.href),
  );
  const queue: Array<{ url: URL; depth: number }> = [];
  const queued = new Set<string>();
  const seed = (url: URL): void => {
    if (!queued.has(url.href) && isScoped(url) && robots.allows(url)) {
      queued.add(url.href);
      queue.push({ url, depth: 0 });
    }
  };
  seed(start);
  for (const path of [...input.settings.includeExactPaths, ...input.settings.includePathPrefixes]) {
    seed(normalizeCrawlUrl(new URL(path, validated.origin)));
  }
  const candidateLimit =
    input.settings.crawlMode === "full"
      ? Math.min(10_000, Math.max(input.settings.maxPages * 2, 100))
      : Math.max(input.settings.maxPages * 5, 100);
  for (const url of prioritized) {
    if (queued.size >= candidateLimit) break;
    if (!queued.has(url.href)) {
      queued.add(url.href);
      queue.push({ url, depth: 0 });
    }
  }

  let processedCount = 0;
  let profileVersion = "generic-v1";
  while (queue.length && processedCount < input.settings.maxPages) {
    const current = queue.shift()!;
    let result: CrawlPageResult;
    try {
      const response = await fetchResource(current.url, htmlContentTypes);
      if (response.status < 200 || response.status >= 300) {
        throw new CrawlerError(`CRAWL_HTTP_${response.status}`, response.status >= 500);
      }
      const extracted = extractHtmlPage(response.body, response.finalUrl.toString());
      const canonical = normalizeCrawlUrl(extracted.canonicalUrl);
      if (!isScoped(canonical)) extracted.canonicalUrl = response.finalUrl.toString();
      profileVersion = extracted.profileVersion;
      result = {
        normalizedUrl: response.finalUrl.toString(),
        depth: current.depth,
        status: "succeeded",
        httpStatus: response.status,
        contentType: response.contentType,
        extracted,
        errorCode: null,
        retryable: false,
        fetchedAt: new Date(),
      };
      if (current.depth < input.settings.maxDepth) {
        for (const value of extracted.links) {
          if (queued.size >= candidateLimit) break;
          try {
            const url = normalizeCrawlUrl(value);
            if (!queued.has(url.href) && isScoped(url) && robots.allows(url)) {
              queued.add(url.href);
              queue.push({ url, depth: current.depth + 1 });
            }
          } catch {
            // Invalid and unsupported page links are not crawl candidates.
          }
        }
      }
    } catch (error) {
      const crawlError = toCrawlerError(error);
      result = {
        normalizedUrl: current.url.toString(),
        depth: current.depth,
        status: "failed",
        httpStatus: crawlError.code.startsWith("CRAWL_HTTP_")
          ? Number.parseInt(crawlError.code.slice("CRAWL_HTTP_".length), 10)
          : null,
        contentType: null,
        extracted: null,
        errorCode: crawlError.code,
        retryable: crawlError.retryable,
        fetchedAt: null,
      };
    }
    processedCount += 1;
    await input.onPage(result, queued.size);
  }
  return {
    discoveredCount: queued.size,
    processedCount,
    profileVersion,
  };
};
