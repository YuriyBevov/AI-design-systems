import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const DEFAULT_LIMIT = 40;
const DEFAULT_DELAY = 500;
const USER_AGENT = "NewmarkCatalogImporter/0.1 (+draft import for internal catalog normalization)";

const args = process.argv.slice(2);
const startUrl = args.find((arg) => !arg.startsWith("--"));

if (!startUrl) {
  console.error("Usage: node scripts/import-catalog-source.mjs <url> [--source=name] [--limit=40] [--delay=500]");
  process.exit(1);
}

const options = Object.fromEntries(
  args
    .filter((arg) => arg.startsWith("--"))
    .map((arg) => {
      const [key, value = "true"] = arg.slice(2).split("=");
      return [key, value];
    }),
);

const sourceName = options.source ?? new URL(startUrl).hostname.replace(/^www\./, "");
const limit = Number(options.limit ?? DEFAULT_LIMIT);
const delay = Number(options.delay ?? DEFAULT_DELAY);
const rootUrl = new URL(startUrl);
const outputDir = path.resolve("src/data/catalog/imports");
const outputPath = path.join(outputDir, `${sourceName}-draft.json`);
const imageOutputDir = path.resolve("public/catalog/products", sourceName);
const imagePublicPath = `/catalog/products/${sourceName}`;
const CHARACTERISTIC_LABELS = [
  "Ширина, мм",
  "Ширина (мм)",
  "Ширина",
  "Длина, м",
  "Длина (м)",
  "Длина",
  "Намотка, м",
  "Намотка",
  "Толщина, мкм",
  "Толщина (мкм)",
  "Толщина, мм",
  "Толщина (мм)",
  "Толщина",
  "Материал",
  "Цвет",
  "Назначение",
  "Производитель",
  "Количество роликов в коробке, шт",
  "Кол-во роликов в коробке, шт",
  "Количество, шт/кор",
  "Количество , шт/кор",
  "Количество, шт",
  "Тип товара",
  "Цена с НДС за коробку, руб",
  "Цена за коробку, руб",
];
const CHARACTERISTIC_LABEL_MAP = {
  "Цена с НДС за коробку, руб": "Стоимость коробки с НДС",
  "Цена за коробку, руб": "Стоимость коробки с НДС",
};

const sleep = (ms) => new Promise((resolve) => {
  setTimeout(resolve, ms);
});

const normalizeText = (value) => value
  .replace(/&nbsp;/g, " ")
  .replace(/&mdash;/g, "—")
  .replace(/&laquo;/g, "«")
  .replace(/&raquo;/g, "»")
  .replace(/&amp;/g, "&")
  .replace(/&#8381;|&#x20bd;/gi, "₽")
  .replace(/<br\s*\/?>/gi, "\n")
  .replace(/<[^>]*>/g, " ")
  .replace(/\s+/g, " ")
  .replace(/скотч[а-яё]*/gi, "клейкая лента")
  .trim();

const normalizeProductTitle = (value) => normalizeText(value)
  .replace(/\(\s*клейкая лента\s*\)/gi, "")
  .replace(/\s+/g, " ")
  .trim();

const normalizeUrl = (href, baseUrl) => {
  try {
    const url = new URL(href, baseUrl);
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
};

const slugify = (value) => value
  .toLowerCase()
  .replace(/ё/g, "e")
  .replace(/й/g, "i")
  .replace(/ц/g, "c")
  .replace(/у/g, "u")
  .replace(/к/g, "k")
  .replace(/е/g, "e")
  .replace(/н/g, "n")
  .replace(/г/g, "g")
  .replace(/ш/g, "sh")
  .replace(/щ/g, "sch")
  .replace(/з/g, "z")
  .replace(/х/g, "h")
  .replace(/ъ/g, "")
  .replace(/ф/g, "f")
  .replace(/ы/g, "y")
  .replace(/в/g, "v")
  .replace(/а/g, "a")
  .replace(/п/g, "p")
  .replace(/р/g, "r")
  .replace(/о/g, "o")
  .replace(/л/g, "l")
  .replace(/д/g, "d")
  .replace(/ж/g, "zh")
  .replace(/э/g, "e")
  .replace(/я/g, "ya")
  .replace(/ч/g, "ch")
  .replace(/с/g, "s")
  .replace(/м/g, "m")
  .replace(/и/g, "i")
  .replace(/т/g, "t")
  .replace(/ь/g, "")
  .replace(/б/g, "b")
  .replace(/ю/g, "yu")
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-+|-+$/g, "");

const fetchPage = async (url) => {
  const response = await fetch(url, {
    headers: {
      "user-agent": USER_AGENT,
    },
  });

  if (!response.ok) {
    throw new Error(`Request failed ${response.status} ${response.statusText}`);
  }

  return response.text();
};

const downloadImage = async (imageUrl, slug) => {
  if (!imageUrl) {
    return null;
  }

  const response = await fetch(imageUrl, {
    headers: {
      "user-agent": USER_AGENT,
    },
  });

  if (!response.ok) {
    throw new Error(`Image request failed ${response.status} ${response.statusText}`);
  }

  const filename = `${slug}.webp`;
  const filePath = path.join(imageOutputDir, filename);

  await mkdir(imageOutputDir, {
    recursive: true,
  });

  await sharp(Buffer.from(await response.arrayBuffer()))
    .rotate()
    .resize({
      width: 900,
      height: 900,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({
      quality: 82,
    })
    .toFile(filePath);

  return `${imagePublicPath}/${filename}`;
};

const extractLinks = (html, baseUrl) => {
  const links = [];
  const linkRegex = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;

  while ((match = linkRegex.exec(html))) {
    const href = normalizeUrl(match[1], baseUrl);

    if (!href) {
      continue;
    }

    const url = new URL(href);

    if (url.hostname !== rootUrl.hostname || !url.pathname.startsWith(rootUrl.pathname)) {
      continue;
    }

    links.push({
      href,
      label: normalizeText(match[2]),
    });
  }

  return links;
};

const extractTitle = (html) => {
  const h1 = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  const title = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);

  return normalizeProductTitle(h1?.[1] ?? title?.[1] ?? "");
};

const extractImageUrl = (html, baseUrl, title) => {
  const imageTags = [...html.matchAll(/<img\b[^>]*>/gi)].map((match) => match[0]);
  const titleWords = title.toLowerCase().split(/\s+/).filter((word) => word.length > 3);
  const candidates = imageTags.map((tag) => {
    const src = tag.match(/\bsrc=["']([^"']+)["']/i)?.[1];
    const original = tag.match(/\bdata-original=["']([^"']+)["']/i)?.[1];
    const alt = normalizeProductTitle(tag.match(/\balt=["']([^"']*)["']/i)?.[1] ?? "");
    const imageUrl = normalizeUrl(original ?? src ?? "", baseUrl);

    if (!imageUrl || /picture\.loading\.svg/i.test(imageUrl)) {
      return null;
    }

    const score = [
      /itemprop=["']image["']/i.test(tag) ? 4 : 0,
      alt === title ? 4 : 0,
      titleWords.some((word) => alt.toLowerCase().includes(word)) ? 2 : 0,
      /\/upload\//i.test(imageUrl) ? 1 : 0,
    ].reduce((sum, item) => sum + item, 0);

    return {
      imageUrl,
      alt,
      score,
    };
  }).filter(Boolean).sort((a, b) => b.score - a.score);

  return candidates[0]?.imageUrl ?? "";
};

const extractPrice = (html) => {
  const text = normalizeText(html);
  const price = text.match(/(\d[\d\s,.]*)\s*₽\s*\/\s*([а-яёa-z.]+)/i);

  if (!price) {
    return "";
  }

  return `${price[1].replace(/\s+/g, " ").trim()} ₽ / ${price[2].trim()}`;
};

const formatProductPrice = (price) => {
  const amount = price.match(/\d[\d\s,.]*/)?.[0]?.replace(/\s+/g, " ").trim();

  return amount ? `От ${amount} рублей/штука` : "От рублей/штука";
};

const extractDescription = (html) => {
  const descriptionBlock = html.match(/<h2\b[^>]*>\s*Описание\s*<\/h2>([\s\S]*?)(?:<h2\b|<h3\b|<\/main|<\/body)/i);

  if (!descriptionBlock) {
    return "";
  }

  let description = normalizeText(descriptionBlock[1]);
  const stopMarkers = [
    "Чтобы приобрести",
    "Ширина, мм",
    "Ширина (мм)",
    "Ширина",
    "template.load",
  ];

  stopMarkers.forEach((marker) => {
    const index = description.indexOf(marker);

    if (index !== -1) {
      description = description.slice(0, index).trim();
    }
  });

  return description;
};

const extractCharacteristics = (html) => {
  const text = normalizeText(html);
  const start = text.indexOf("Характеристики");

  if (start === -1) {
    return [];
  }

  const endCandidates = ["Описание", "Отзывы", "Оплата", "Доставка"]
    .map((marker) => text.indexOf(marker, start + "Характеристики".length))
    .filter((index) => index !== -1);
  const end = endCandidates.length > 0 ? Math.min(...endCandidates) : start + 900;
  const chunk = text.slice(start + "Характеристики".length, end);

  const markers = CHARACTERISTIC_LABELS
    .map((label) => {
      const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const match = chunk.match(new RegExp(`(?:^|\\s)(${escapedLabel})\\s+—\\s+`, "i"));

      if (!match || match.index === undefined) {
        return null;
      }

      return {
        label: match[1],
        start: match.index + match[0].length,
        markerStart: match.index,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.markerStart - b.markerStart);

  const pairs = markers.map((marker, index) => {
    const nextMarker = markers[index + 1];
    const valueEnd = nextMarker?.markerStart ?? chunk.length;

    return {
      label: CHARACTERISTIC_LABEL_MAP[marker.label.trim()] ?? marker.label.trim(),
      value: chunk.slice(marker.start, valueEnd).trim(),
    };
  }).filter((item) => item.label && item.value);

  return pairs;
};

const extractProduct = async (url, html) => {
  const title = extractTitle(html);
  const characteristics = extractCharacteristics(html);
  const price = extractPrice(html);

  if (!title || characteristics.length === 0) {
    return null;
  }

  const slug = slugify(title);
  const imageUrl = extractImageUrl(html, url, title);
  const localImage = await downloadImage(imageUrl, slug);

  return {
    source: {
      name: sourceName,
      url,
      imageUrl,
    },
    id: slug,
    parentId: "",
    slug,
    title,
    card: {
      image: localImage,
      imageAlt: title,
      price: formatProductPrice(price),
      characteristics: characteristics.slice(0, 5),
    },
    detail: {
      title,
      lead: "",
      description: extractDescription(html),
      gallery: localImage ? [localImage] : [],
      specifications: characteristics,
      advantages: [],
      order: {
        buttonLabel: "Заказать",
        target: "#request",
      },
      seo: {
        title: `${title} Newmark`,
        description: "",
      },
    },
  };
};

const queue = [rootUrl.toString()];
const visited = new Set();
const products = [];
const errors = [];

while (queue.length > 0 && visited.size < limit) {
  const url = queue.shift();

  if (visited.has(url)) {
    continue;
  }

  visited.add(url);

  try {
    console.log(`Fetch ${visited.size}/${limit}: ${url}`);
    const html = await fetchPage(url);
    const product = await extractProduct(url, html);

    if (product) {
      products.push(product);
    }

    extractLinks(html, url).forEach((link) => {
      if (!visited.has(link.href) && !queue.includes(link.href)) {
        queue.push(link.href);
      }
    });
  } catch (error) {
    errors.push({
      url,
      message: error.message,
    });
  }

  await sleep(delay);
}

const draft = {
  source: {
    name: sourceName,
    startUrl: rootUrl.toString(),
    importedAt: new Date().toISOString(),
  },
  stats: {
    visited: visited.size,
    queued: queue.length,
    products: products.length,
    errors: errors.length,
  },
  products,
  errors,
};

await mkdir(outputDir, {
  recursive: true,
});
await writeFile(outputPath, `${JSON.stringify(draft, null, 2)}\n`);

console.log(`Saved draft: ${outputPath}`);
console.log(JSON.stringify(draft.stats, null, 2));
