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

export type DiscoveredSiteNode = {
  path: string;
  url: string;
  label: string;
  depth: number;
  descendantCount: number;
  source: "sitemap" | "navigation" | "both";
  children: DiscoveredSiteNode[];
};

export type DiscoveredSiteStructure = {
  origin: string;
  method: "sitemap" | "navigation" | "mixed";
  nodes: DiscoveredSiteNode[];
};

type NodeAccumulator = {
  path: string;
  label: string | null;
  depth: number;
  navigationOrder: number | null;
  seenInNavigation: boolean;
  seenInSitemap: boolean;
  children: Set<string>;
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

const normalizeLabel = (value: string): string =>
  value.normalize("NFKC").replace(/\s+/g, " ").trim().slice(0, 160);

const fallbackLabel = (path: string): string => {
  const segment = path.split("/").filter(Boolean).at(-1) ?? path;
  try {
    return decodeURIComponent(segment).replace(/[-_]+/g, " ");
  } catch {
    return segment.replace(/[-_]+/g, " ");
  }
};

const nodePaths = (url: URL, maximumDepth: number): string[] => {
  const segments = url.pathname.split("/").filter(Boolean);
  if (!segments.length || ignoredFirstLevelPaths.has(segments[0]!.toLowerCase())) return [];
  if (/\.(?:avif|css|gif|ico|jpe?g|js|json|pdf|png|svg|webp|xml)$/i.test(segments.at(-1)!)) {
    return [];
  }
  const paths: string[] = [];
  for (let index = 0; index < Math.min(segments.length, maximumDepth); index += 1) {
    paths.push(`/${segments.slice(0, index + 1).join("/")}/`);
  }
  return paths;
};

export const discoverSiteStructure = async (input: {
  startUrl: string;
  maxDepth?: number;
  requestDelayMs?: number;
  lookup?: DnsLookup;
  request?: ResourceRequester;
}): Promise<DiscoveredSiteStructure> => {
  const lookup = input.lookup ?? defaultDnsLookup;
  const validated = await resolvePublicUrl(input.startUrl, lookup);
  const origin = validated.url.origin;
  const maximumDepth = Math.min(8, Math.max(1, input.maxDepth ?? 5));
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

  const nodes = new Map<string, NodeAccumulator>();
  let order = 0;
  const record = (url: URL, source: "sitemap" | "navigation", label?: string): boolean => {
    if (url.origin !== origin || url.search || !robots.allows(url)) return false;
    const paths = nodePaths(url, maximumDepth);
    if (!paths.length) return false;
    for (const [index, path] of paths.entries()) {
      let node = nodes.get(path);
      if (!node) {
        node = {
          path,
          label: null,
          depth: index + 1,
          navigationOrder: null,
          seenInNavigation: false,
          seenInSitemap: false,
          children: new Set(),
        };
        nodes.set(path, node);
      }
      if (source === "sitemap") node.seenInSitemap = true;
      if (source === "navigation") {
        node.seenInNavigation = true;
        node.navigationOrder ??= order;
        if (index === paths.length - 1 && label) node.label ||= normalizeLabel(label) || null;
      }
      const parentPath = paths[index - 1];
      if (parentPath) nodes.get(parentPath)?.children.add(path);
    }
    order += 1;
    return true;
  };

  let navigationFound = false;
  const homeUrl = new URL("/", origin);
  if (robots.allows(homeUrl)) {
    try {
      const response = await fetchResource(
        homeUrl,
        htmlContentTypes,
        (url) => url.origin === origin && robots.allows(url),
      );
      if (response.status >= 200 && response.status < 300) {
        const $ = load(response.body);
        $("nav a[href], header a[href], [role='navigation'] a[href]")
          .toArray()
          .slice(0, 3_000)
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
      }
    } catch {
      // Sitemap discovery can still build the tree when the home page is unavailable.
    }
  }

  let sitemapFound = false;
  const sitemapQueue = [...robots.sitemapUrls, new URL("/sitemap.xml", origin).toString()];
  const visitedSitemaps = new Set<string>();
  const sitemapUrls = new Set<string>();
  while (sitemapQueue.length && visitedSitemaps.size < 50 && sitemapUrls.size < 10_000) {
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
        if (sitemapQueue.length + visitedSitemaps.size < 100) {
          sitemapQueue.push($(element).text().trim());
        }
      });
      $("url > loc").each((_, element) => {
        if (sitemapUrls.size >= 10_000) return;
        try {
          const url = normalizeCrawlUrl($(element).text().trim());
          if (url.origin !== origin || url.search || !robots.allows(url)) return;
          sitemapUrls.add(url.href);
          if (record(url, "sitemap")) sitemapFound = true;
        } catch {
          // Invalid sitemap entries are untrusted and ignored.
        }
      });
    } catch {
      // Navigation can still provide a partial tree.
    }
  }

  const countDescendants = (path: string): number => {
    const node = nodes.get(path);
    if (!node) return 0;
    return [...node.children].reduce((total, child) => total + 1 + countDescendants(child), 0);
  };
  const toNode = (path: string): DiscoveredSiteNode => {
    const node = nodes.get(path)!;
    const children = [...node.children]
      .sort((left, right) => {
        const leftNode = nodes.get(left)!;
        const rightNode = nodes.get(right)!;
        return (
          (leftNode.navigationOrder ?? Number.MAX_SAFE_INTEGER) -
            (rightNode.navigationOrder ?? Number.MAX_SAFE_INTEGER) || left.localeCompare(right)
        );
      })
      .map(toNode);
    return {
      path: node.path,
      url: new URL(node.path, origin).toString(),
      label: node.label ?? fallbackLabel(node.path),
      depth: node.depth,
      descendantCount: countDescendants(node.path),
      source:
        node.seenInNavigation && node.seenInSitemap
          ? "both"
          : node.seenInSitemap
            ? "sitemap"
            : "navigation",
      children,
    };
  };

  const roots = [...nodes.values()]
    .filter((node) => node.depth === 1)
    .sort(
      (left, right) =>
        (left.navigationOrder ?? Number.MAX_SAFE_INTEGER) -
          (right.navigationOrder ?? Number.MAX_SAFE_INTEGER) || left.path.localeCompare(right.path),
    )
    .map((node) => toNode(node.path));

  return {
    origin,
    method: sitemapFound && navigationFound ? "mixed" : sitemapFound ? "sitemap" : "navigation",
    nodes: roots,
  };
};
