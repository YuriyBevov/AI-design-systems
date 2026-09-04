import { load, type CheerioAPI } from "cheerio";

import { CrawlerError } from "./errors.js";

export type ExtractedProduct = {
  externalId: string | null;
  sku: string | null;
  category: string | null;
  priceDisplay: string | null;
  priceAmount: number | null;
  currency: string | null;
  availability: string | null;
  minimumOrder: number | null;
  characteristics: Record<string, string>;
};

export type ExtractedPage = {
  type: "page" | "product";
  title: string;
  canonicalUrl: string;
  content: string;
  product: ExtractedProduct | null;
  confidence: number;
  warnings: string[];
  links: string[];
  profileVersion: string;
};

const normalizeText = (value: string): string =>
  value
    .normalize("NFKC")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

const stringValue = (value: unknown): string | null => {
  if (typeof value === "string") return normalizeText(value) || null;
  if (typeof value === "number") return String(value);
  return null;
};

const arrayValue = (value: unknown): unknown[] => (Array.isArray(value) ? value : [value]);

const collectJsonLd = ($: CheerioAPI): Record<string, unknown>[] => {
  const output: Record<string, unknown>[] = [];
  $("script[type='application/ld+json']").each((_, element) => {
    const source = $(element).text();
    if (!source || source.length > 100_000) return;
    try {
      const queue = arrayValue(JSON.parse(source));
      let visited = 0;
      while (queue.length && visited < 100) {
        const value = queue.shift();
        visited += 1;
        if (!value || typeof value !== "object" || Array.isArray(value)) continue;
        const record = value as Record<string, unknown>;
        output.push(record);
        if (record["@graph"]) queue.push(...arrayValue(record["@graph"]));
      }
    } catch {
      // Malformed JSON-LD is untrusted input; semantic and generic extractors remain available.
    }
  });
  return output;
};

const hasType = (record: Record<string, unknown>, expected: string): boolean =>
  arrayValue(record["@type"]).some(
    (value) => typeof value === "string" && value.toLowerCase() === expected.toLowerCase(),
  );

const numberValue = (value: unknown): number | null => {
  const parsed = Number.parseFloat(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

const extractJsonLdProduct = (records: Record<string, unknown>[]): ExtractedProduct | null => {
  const product = records.find((record) => hasType(record, "Product"));
  if (!product) return null;
  const rawOffers = arrayValue(product.offers).find((value): value is Record<string, unknown> =>
    Boolean(value && typeof value === "object"),
  );
  const availabilityUrl = stringValue(rawOffers?.availability);
  return {
    externalId: stringValue(product.productID ?? product.sku),
    sku: stringValue(product.sku),
    category: stringValue(product.category),
    priceDisplay: stringValue(rawOffers?.price),
    priceAmount: numberValue(rawOffers?.price),
    currency: stringValue(rawOffers?.priceCurrency)?.toUpperCase() ?? null,
    availability: availabilityUrl?.split("/").pop() ?? null,
    minimumOrder: null,
    characteristics: {},
  };
};

const extractMicrodataProduct = ($: CheerioAPI): ExtractedProduct | null => {
  const root = $("[itemscope][itemtype*='schema.org/Product']").first();
  if (!root.length) return null;
  const value = (selector: string): string | null => {
    const element = root.find(selector).first();
    return normalizeText(element.attr("content") ?? element.text()) || null;
  };
  const characteristics: Record<string, string> = {};
  root.find(".props_item").each((_, element) => {
    const name = normalizeText(
      $(element).find(".char_name [itemprop='name'], .char_name").first().text(),
    )
      .replace(/:$/, "")
      .trim();
    const characteristicValue = normalizeText($(element).find(".char_value").first().text());
    if (name && characteristicValue && Object.keys(characteristics).length < 60) {
      characteristics[name.slice(0, 160)] = characteristicValue.slice(0, 1_000);
    }
  });
  const sku = value("[itemprop='sku']");
  const price = value("[itemprop='price']");
  const currency = value("[itemprop='priceCurrency']");
  const priceDisplay = normalizeText(root.find(".price_value_block").first().text());
  const breadcrumb = $(".breadcrumbs__item, .breadcrumb__item, .breadcrumbs a")
    .toArray()
    .map((element) => normalizeText($(element).text()))
    .filter(Boolean)
    .slice(-2)
    .join(" / ");
  return {
    externalId: sku,
    sku,
    category: breadcrumb || null,
    priceDisplay: priceDisplay || (price ? `${price} ${currency?.toUpperCase() ?? "RUB"}` : null),
    priceAmount: numberValue(price),
    currency: currency?.toUpperCase() ?? (price ? "RUB" : null),
    availability: value("[itemprop='availability']"),
    minimumOrder: null,
    characteristics,
  };
};

const genericMainText = ($: CheerioAPI): string => {
  const clone = $.root().clone();
  clone
    .find(
      "script, style, noscript, template, svg, header, nav, footer, form, .breadcrumbs, .cookie, .basket, .sidebar",
    )
    .remove();
  const preferred = clone.find("main, article, #content, .content_wrapper_block").first();
  return normalizeText((preferred.length ? preferred : clone.find("body")).text()).slice(0, 30_000);
};

const detectInstructionLikeContent = (content: string): boolean =>
  /(ignore (all|previous)|system prompt|reveal (the )?(secret|key)|игнорируй (все|предыдущие)|системн(ый|ые) промпт)/i.test(
    content,
  );

export const extractHtmlPage = (html: string, requestedUrl: string): ExtractedPage => {
  const $ = load(html);
  const records = collectJsonLd($);
  const jsonProduct = extractJsonLdProduct(records);
  const microdataProduct = extractMicrodataProduct($);
  const product = jsonProduct ?? microdataProduct;
  const productRecord = records.find((record) => hasType(record, "Product"));
  const title = normalizeText(
    stringValue(productRecord?.name) ||
      $("h1").first().text() ||
      $("meta[property='og:title']").attr("content") ||
      $("title").text(),
  ).slice(0, 500);
  if (!title) throw new CrawlerError("CRAWL_TITLE_MISSING");
  const canonicalHref = $("link[rel='canonical']").first().attr("href");
  let canonicalUrl = requestedUrl;
  if (canonicalHref) {
    try {
      canonicalUrl = new URL(canonicalHref, requestedUrl).toString();
    } catch {
      canonicalUrl = requestedUrl;
    }
  }
  const description = normalizeText(
    stringValue(productRecord?.description) ||
      $("[itemscope][itemtype*='schema.org/Product'] [itemprop='description']")
        .first()
        .attr("content") ||
      $("[itemscope][itemtype*='schema.org/Product'] [itemprop='description']").first().text() ||
      "",
  );
  const content = (product && description ? description : genericMainText($)).slice(0, 30_000);
  if (!content) throw new CrawlerError("CRAWL_CONTENT_EMPTY");
  const warnings: string[] = [];
  if (detectInstructionLikeContent(content)) warnings.push("INSTRUCTION_LIKE_CONTENT");
  if (product && !product.sku) warnings.push("PRODUCT_SKU_MISSING");
  if (product && product.priceAmount === null) warnings.push("PRODUCT_PRICE_MISSING");
  const links = $("a[href]")
    .toArray()
    .slice(0, 2_000)
    .flatMap((element) => {
      const href = $(element).attr("href");
      if (!href) return [];
      try {
        return [new URL(href, requestedUrl).toString()];
      } catch {
        return [];
      }
    });
  const facts = product
    ? [
        product.sku,
        product.priceAmount,
        product.category,
        Object.keys(product.characteristics).length,
      ]
    : [];
  const confidence = product
    ? Math.min(0.98, 0.64 + facts.filter(Boolean).length * 0.08)
    : title && content.length >= 200
      ? 0.78
      : 0.58;
  return {
    type: product ? "product" : "page",
    title,
    canonicalUrl,
    content,
    product,
    confidence,
    warnings,
    links: [...new Set(links)],
    profileVersion: requestedUrl.includes("gofroprodpak.ru") ? "gofroprodpak-v1" : "generic-v1",
  };
};
