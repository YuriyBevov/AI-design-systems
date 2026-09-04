import { load } from "cheerio";

import { crawlerUserAgent } from "./constants.js";
import { CrawlerError } from "./errors.js";
import { parseRobots } from "./robots.js";
import { fetchSafeResource, type ResourceRequester } from "./safe-fetch.js";
import {
  defaultDnsLookup,
  normalizeCrawlUrl,
  resolvePublicUrl,
  type DnsLookup,
} from "./url-policy.js";

export type DiscoveredSiteSection = {
  path: string;
  url: string;
  label: string;
  descendantCount: number;
  source: "sitemap" | "navigation" | "both";
};

export type DiscoveredSiteStructure = {
  origin: string;
  method: "sitemap" | "navigation" | "mixed";
  sections: DiscoveredSiteSection[];
};

type SectionAccumulator = {
  path: string;
  urls: Set<string>;
  navigationLabel: string | null;
  navigationOrder: number | null;
  seenInNavigation: boolean;
  seenInSitemap: boolean;
};

const robotsContentTypes = ["text/plain", "text/html"];
const sitemapContentTypes = ["application/xml", "text/xml", "text/plain", "application/rss+xml"];
const htmlContentTypes = ["text/html", "application/xhtml+xml"];
const ignoredFirstLevelPaths = new Set([
  "api",
  "assets",
  "auth",
  "basket",
  "bitrix",
  "include",
  "personal",
  "search",
  "upload",
]);

const wait = async (milliseconds: number): Promise<void> => {
  if (milliseconds <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
};

const firstLevelPath = (url: URL): string | null => {
  const [segment] = url.pathname.split("/").filter(Boolean);
  if (!segment || ignoredFirstLevelPaths.has(segment.toLowerCase())) return null;
  if (/\.(?:avif|css|gif|ico|jpe?g|js|json|pdf|png|svg|webp|xml)$/i.test(segment)) return null;
  return `/${segment}/`;
};

const normalizeLabel = (value: string): string =>
  value.normalize("NFKC").replace(/\s+/g, " ").trim().slice(0, 160);

const fallbackLabel = (path: string): string => {
  const segment = path.split("/").filter(Boolean)[0] ?? path;
  try {
    return decodeURIComponent(segment).replace(/[-_]+/g, " ");
  } catch {
    return segment.replace(/[-_]+/g, " ");
  }
};

export const discoverSiteStructure = async (input: {
  startUrl: string;
  maxSections?: number;
  requestDelayMs?: number;
  lookup?: DnsLookup;
  request?: ResourceRequester;
}): Promise<DiscoveredSiteStructure> => {
  const lookup = input.lookup ?? defaultDnsLookup;
  const validated = await resolvePublicUrl(input.startUrl, lookup);
  const origin = validated.url.origin;
  const maxSections = Math.min(100, Math.max(1, input.maxSections ?? 100));
  let effectiveDelayMs = Math.max(0, input.requestDelayMs ?? 250);
  const fetchResource = async (
    url: string | URL,
    contentTypes: string[],
    isAllowedUrl: (candidate: URL) => boolean,
  ) => {
    await wait(effectiveDelayMs);
    return fetchSafeResource({
      url,
      allowedOrigin: origin,
      isAllowedUrl,
      allowedContentTypes: contentTypes,
      userAgent: crawlerUserAgent,
      lookup,
      maxBytes: 2_000_000,
      ...(input.request ? { request: input.request } : {}),
    });
  };

  const robotsUrl = new URL("/robots.txt", origin);
  const robotsResponse = await fetchResource(
    robotsUrl,
    robotsContentTypes,
    (url) => url.origin === origin && url.pathname === "/robots.txt",
  );
  if (
    robotsResponse.status !== 404 &&
    (robotsResponse.status < 200 || robotsResponse.status >= 300)
  ) {
    throw new CrawlerError("CRAWL_ROBOTS_UNAVAILABLE", true);
  }
  const robots = parseRobots(robotsResponse.status === 404 ? "" : robotsResponse.body);
  effectiveDelayMs = Math.max(effectiveDelayMs, robots.crawlDelayMs);

  const sections = new Map<string, SectionAccumulator>();
  const record = (url: URL, source: "sitemap" | "navigation", label?: string): boolean => {
    if (url.origin !== origin || url.search || !robots.allows(url)) return false;
    const path = firstLevelPath(url);
    if (!path) return false;
    let section = sections.get(path);
    if (!section) {
      if (sections.size >= maxSections) return false;
      section = {
        path,
        urls: new Set(),
        navigationLabel: null,
        navigationOrder: null,
        seenInNavigation: false,
        seenInSitemap: false,
      };
      sections.set(path, section);
    }
    section.urls.add(url.href);
    if (source === "sitemap") section.seenInSitemap = true;
    if (source === "navigation") {
      section.seenInNavigation = true;
      section.navigationOrder ??= sections.size;
      section.navigationLabel ||= label ? normalizeLabel(label) || null : null;
    }
    return true;
  };

  let navigationFound = false;
  const navigationCandidates = [new URL("/", origin), validated.url].filter(
    (url, index, values) =>
      values.findIndex((candidate) => candidate.href === url.href) === index && robots.allows(url),
  );
  for (const navigationUrl of navigationCandidates) {
    try {
      const response = await fetchResource(
        navigationUrl,
        htmlContentTypes,
        (url) => url.origin === origin && robots.allows(url),
      );
      if (response.status < 200 || response.status >= 300) continue;
      const $ = load(response.body);
      $("a[href]")
        .toArray()
        .slice(0, 2_000)
        .forEach((element) => {
          const href = $(element).attr("href");
          if (!href) return;
          try {
            const url = normalizeCrawlUrl(new URL(href, response.finalUrl));
            if (record(url, "navigation", $(element).text())) navigationFound = true;
          } catch {
            // Invalid, unsupported and out-of-origin links are ignored.
          }
        });
      break;
    } catch {
      // A sitemap can still provide the structure when navigation is unavailable.
    }
  }

  let sitemapFound = false;
  const sitemapQueue = [...robots.sitemapUrls, new URL("/sitemap.xml", origin).toString()];
  const visitedSitemaps = new Set<string>();
  const sitemapUrls = new Set<string>();
  while (sitemapQueue.length && visitedSitemaps.size < 8 && sitemapUrls.size < 2_000) {
    const value = sitemapQueue.shift()!;
    let sitemapUrl: URL;
    try {
      sitemapUrl = normalizeCrawlUrl(value);
    } catch {
      continue;
    }
    if (sitemapUrl.origin !== origin || visitedSitemaps.has(sitemapUrl.href)) continue;
    visitedSitemaps.add(sitemapUrl.href);
    try {
      const response = await fetchResource(
        sitemapUrl,
        sitemapContentTypes,
        (url) => url.origin === origin && /sitemap[^/]*\.xml$/i.test(url.pathname),
      );
      if (response.status < 200 || response.status >= 300) continue;
      const $ = load(response.body, { xmlMode: true });
      $("sitemap > loc").each((_, element) => {
        if (sitemapQueue.length + visitedSitemaps.size < 30) {
          sitemapQueue.push($(element).text().trim());
        }
      });
      $("url > loc").each((_, element) => {
        if (sitemapUrls.size >= 2_000) return;
        try {
          const url = normalizeCrawlUrl($(element).text().trim());
          if (url.origin !== origin || url.search || !robots.allows(url)) return;
          sitemapUrls.add(url.href);
          record(url, "sitemap");
          sitemapFound = true;
        } catch {
          // Invalid sitemap entries are untrusted and ignored.
        }
      });
    } catch {
      // A physical navigation structure can still be returned.
    }
  }

  return {
    origin,
    method: sitemapFound && navigationFound ? "mixed" : sitemapFound ? "sitemap" : "navigation",
    sections: [...sections.values()]
      .sort(
        (left, right) =>
          (left.navigationOrder ?? Number.MAX_SAFE_INTEGER) -
            (right.navigationOrder ?? Number.MAX_SAFE_INTEGER) ||
          left.path.localeCompare(right.path),
      )
      .map((section) => ({
        path: section.path,
        url: new URL(section.path, origin).toString(),
        label: section.navigationLabel ?? fallbackLabel(section.path),
        descendantCount: Math.max(
          0,
          [...section.urls].filter((url) => normalizeCrawlUrl(url).pathname !== section.path)
            .length,
        ),
        source:
          section.seenInNavigation && section.seenInSitemap
            ? "both"
            : section.seenInSitemap
              ? "sitemap"
              : "navigation",
      })),
  };
};
