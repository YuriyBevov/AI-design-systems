import { load } from "cheerio";

import { CrawlerError } from "./errors.js";

export type ExtractedPage = {
  title: string;
  sourceUrl: string;
  content: string;
  links: string[];
};

const normalizeRawText = (value: string): string =>
  value
    .normalize("NFKC")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

export const extractHtmlPage = (html: string, requestedUrl: string): ExtractedPage => {
  const $ = load(html);
  const title = normalizeRawText($("h1").first().text() || $("title").first().text()).slice(0, 500);
  if (!title) throw new CrawlerError("CRAWL_TITLE_MISSING");

  // This is intentionally raw body extraction. Boilerplate, navigation, repeated blocks and
  // classification are handled only by the isolated AI normalization stage in the worker.
  const content = normalizeRawText($("body").text()).slice(0, 30_000);
  if (!content) throw new CrawlerError("CRAWL_CONTENT_EMPTY");

  const links = $("a[href]")
    .toArray()
    .slice(0, 3_000)
    .flatMap((element) => {
      const href = $(element).attr("href");
      if (!href) return [];
      try {
        return [new URL(href, requestedUrl).toString()];
      } catch {
        return [];
      }
    });

  return {
    title,
    sourceUrl: requestedUrl,
    content,
    links: [...new Set(links)],
  };
};
