import { lookup as nodeLookup } from "node:dns/promises";
import { isIP } from "node:net";

import ipaddr from "ipaddr.js";

import { CrawlerError } from "./errors.js";

export type ResolvedAddress = { address: string; family: 4 | 6 };
export type DnsLookup = (hostname: string) => Promise<ResolvedAddress[]>;

export const defaultDnsLookup: DnsLookup = async (hostname) => {
  const results = await nodeLookup(hostname, { all: true, verbatim: true });
  return results.map((result) => ({ address: result.address, family: result.family as 4 | 6 }));
};

const isPublicAddress = (value: string): boolean => {
  if (!ipaddr.isValid(value)) return false;
  const parsed = ipaddr.parse(value);
  if (parsed.kind() === "ipv6" && "isIPv4MappedAddress" in parsed && parsed.isIPv4MappedAddress()) {
    return parsed.toIPv4Address().range() === "unicast";
  }
  return parsed.range() === "unicast";
};

export const normalizeCrawlUrl = (value: string | URL): URL => {
  let url: URL;
  try {
    url = value instanceof URL ? new URL(value) : new URL(value);
  } catch {
    throw new CrawlerError("CRAWL_URL_INVALID");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new CrawlerError("CRAWL_URL_SCHEME_FORBIDDEN");
  }
  if (url.username || url.password) throw new CrawlerError("CRAWL_URL_CREDENTIALS_FORBIDDEN");
  if (!url.hostname || url.hostname.endsWith(".")) {
    throw new CrawlerError("CRAWL_URL_HOST_INVALID");
  }
  const expectedPort = url.protocol === "https:" ? "443" : "80";
  if (url.port && url.port !== expectedPort) throw new CrawlerError("CRAWL_URL_PORT_FORBIDDEN");
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    if (/^(utm_.+|gclid|fbclid|yclid)$/i.test(key)) url.searchParams.delete(key);
  }
  if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/{2,}/g, "/");
  return url;
};

export const resolvePublicUrl = async (
  value: string | URL,
  lookup: DnsLookup = defaultDnsLookup,
): Promise<{ url: URL; addresses: ResolvedAddress[] }> => {
  const url = normalizeCrawlUrl(value);
  const literalFamily = isIP(url.hostname);
  const addresses = literalFamily
    ? [{ address: url.hostname, family: literalFamily as 4 | 6 }]
    : await lookup(url.hostname).catch(() => {
        throw new CrawlerError("CRAWL_DNS_LOOKUP_FAILED", true);
      });
  if (!addresses.length) throw new CrawlerError("CRAWL_DNS_EMPTY", true);
  if (addresses.some((address) => !isPublicAddress(address.address))) {
    throw new CrawlerError("CRAWL_ADDRESS_FORBIDDEN");
  }
  return { url, addresses };
};

const normalizedPrefix = (value: string): string =>
  value.length > 1 && value.endsWith("/") ? value : `${value}${value.endsWith("/") ? "" : "/"}`;

const pathMatchesPrefix = (pathname: string, prefix: string): boolean => {
  if (prefix === "/") return true;
  const normalized = normalizedPrefix(prefix);
  return pathname === normalized.slice(0, -1) || pathname.startsWith(normalized);
};

const pathMatchesExact = (pathname: string, exactPath: string): boolean =>
  pathname === exactPath ||
  (pathname.length > 1 ? pathname.replace(/\/$/, "") : pathname) ===
    (exactPath.length > 1 ? exactPath.replace(/\/$/, "") : exactPath);

export const isUrlInScope = (
  candidate: URL,
  input: {
    origin: string;
    includePathPrefixes: string[];
    includeExactPaths: string[];
    excludePathPrefixes: string[];
  },
): boolean =>
  candidate.origin === input.origin &&
  !candidate.search &&
  (input.includeExactPaths.some((path) => pathMatchesExact(candidate.pathname, path)) ||
    input.includePathPrefixes.some((prefix) => pathMatchesPrefix(candidate.pathname, prefix))) &&
  !input.excludePathPrefixes.some((prefix) => pathMatchesPrefix(candidate.pathname, prefix));
