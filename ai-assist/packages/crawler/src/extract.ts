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

const rawContentCharacterLimit = 120_000;

const technicalNodeSelector = [
  "script",
  "style",
  "noscript",
  "template",
  "svg",
  "iframe",
  "canvas",
  "object",
  "embed",
  "audio",
  "video",
  "[hidden]",
  "[aria-hidden='true']",
].join(", ");

const boilerplateNodeSelector = [
  "nav",
  "aside",
  "menu",
  "dialog",
  "[role='banner']",
  "[role='navigation']",
  "[role='contentinfo']",
  "[role='dialog']",
  "[aria-modal='true']",
].join(", ");

const boilerplateMarkerPattern =
  /(?:^|[\s_-])(?:breadcrumbs?|cookie|consent|pagination|pager|social|share|sharing|newsletter|subscribe|subscription|modal|popup|offcanvas|overlay|toast|notification|menu|navigation|navbar|sidebar|callback|feedback|cta|advert|advertisement|promo)(?:$|[\s_-])/iu;
const siteChromeMarkerPattern =
  /(?:^|\s)(?:(?:(?:site|main|page|mobile|fixed|custom)[_-]?)?(?:header|footer)|(?:header|footer)fixed)(?:$|\s)/iu;
const removableFormMarkerPattern =
  /(?:^|[\s_-])(?:search|subscribe|subscription|newsletter|callback|feedback)(?:$|[\s_-])/iu;

const elementMarker = (className: string | undefined, id: string | undefined): string =>
  `${className ?? ""} ${id ?? ""}`
    .replace(/([a-zа-я])([A-ZА-Я])/gu, "$1 $2")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .toLowerCase();

export const extractHtmlPage = (html: string, requestedUrl: string): ExtractedPage => {
  const $ = load(html);
  const title = normalizeRawText($("h1").first().text() || $("title").first().text()).slice(0, 500);
  if (!title) throw new CrawlerError("CRAWL_TITLE_MISSING");

  // Links are collected before content pruning so navigation can still expand the crawl queue.
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

  $(technicalNodeSelector).remove();
  $(boilerplateNodeSelector).remove();
  $("header, footer").each((_, element) => {
    if ($(element).closest("main, article, [role='main']").length === 0) $(element).remove();
  });
  const bodyTextLengthBeforeBoilerplate = normalizeRawText($("body").text()).length;
  $("[class], [id]").each((_, element) => {
    const marker = elementMarker($(element).attr("class"), $(element).attr("id"));
    const isOutsideMainContent = $(element).closest("main, article, [role='main']").length === 0;
    const isBoilerplate =
      boilerplateMarkerPattern.test(marker) ||
      (isOutsideMainContent && siteChromeMarkerPattern.test(marker));
    if (!isBoilerplate || ["html", "body"].includes(element.tagName.toLowerCase())) return;
    if ($(element).find("main, article, [role='main']").length > 0) return;
    const elementTextLength = normalizeRawText($(element).text()).length;
    if (elementTextLength * 10 >= bodyTextLengthBeforeBoilerplate * 7) return;
    $(element).remove();
  });
  $("form").each((_, element) => {
    const marker = elementMarker($(element).attr("class"), $(element).attr("id"));
    const role = $(element).attr("role")?.toLowerCase();
    const action = $(element).attr("action")?.toLowerCase() ?? "";
    if (
      role === "search" ||
      removableFormMarkerPattern.test(marker) ||
      removableFormMarkerPattern.test(action)
    ) {
      $(element).remove();
    }
  });

  const content = normalizeRawText($("body").text()).slice(0, rawContentCharacterLimit);
  if (!content) throw new CrawlerError("CRAWL_CONTENT_EMPTY");

  return {
    title,
    sourceUrl: requestedUrl,
    content,
    links: [...new Set(links)],
  };
};
