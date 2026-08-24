import { readFile, writeFile } from "node:fs/promises";

const inputPath = "src/data/catalog/imports/arli-adhesive-draft.json";
const outputPath = "src/data/catalog/products.js";

const categoryPaths = {
  "kleikaya-lenta": "kleikaya-lenta",
  "malyarnaya-lenta": "kleikaya-lenta/malyarnaya-lenta",
  "termostoykaya-malyarnaya": "kleikaya-lenta/termostoykaya-malyarnaya",
  tpl: "kleikaya-lenta/tpl",
  "lenty-s-naneseniem": "kleikaya-lenta/lenty-s-naneseniem",
  "izolyatsionnaya-lenta": "kleikaya-lenta/izolyatsionnaya-lenta",
  "poverhnostnaya-pechat": "kleikaya-lenta/s-logotipom/poverhnostnaya-pechat",
};

const categoryOrder = Object.keys(categoryPaths);

const normalizeText = (value = "") => value
  .replace(/скотч[а-яё]*/gi, "клейкая лента")
  .replace(/\s+/g, " ")
  .trim();

const normalizeTitle = (value = "") => normalizeText(value)
  .replace(/\*/g, " x ")
  .replace(/\s*(мм|м|мкм)\b/gi, " $1")
  .replace(/\s+x\s+/gi, " x ")
  .replace(/\s+/g, " ")
  .trim();

const normalizeLabel = (value = "") => {
  const label = normalizeText(value).replace(/\s+,/g, ",").replace(/\s*,\s*/g, ", ");

  if (/^Цена с НДС за коробку/i.test(label) || /^Цена за коробку/i.test(label) || /^Коробка с НДС$/i.test(label)) {
    return "Стоимость коробки с НДС";
  }

  return label;
};

const normalizeValue = (value = "") => normalizeText(value)
  .replace(/\bр\/шт\b/gi, "рублей/штука")
  .replace(/\bруб\.?\s*\/\s*шт\.?\b/gi, "рублей/штука")
  .trim();

const normalizeCharacteristic = (characteristic) => ({
  label: normalizeLabel(characteristic.label),
  value: normalizeValue(characteristic.value),
});

const embeddedCharacteristicLabels = [
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

const embeddedLabelPattern = embeddedCharacteristicLabels
  .sort((a, b) => b.length - a.length)
  .map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\ /g, "\\s+"))
  .join("|");

const splitMergedCharacteristic = (characteristic) => {
  const normalized = normalizeCharacteristic(characteristic);
  const markerRegex = new RegExp(`\\s+(${embeddedLabelPattern})\\s+—\\s+`, "gi");
  const markers = [...normalized.value.matchAll(markerRegex)];

  if (markers.length === 0) {
    return [normalized];
  }

  const result = [{
    label: normalized.label,
    value: normalizeValue(normalized.value.slice(0, markers[0].index)),
  }];

  markers.forEach((marker, index) => {
    const nextMarker = markers[index + 1];
    const valueStart = marker.index + marker[0].length;
    const valueEnd = nextMarker?.index ?? normalized.value.length;

    result.push({
      label: normalizeLabel(marker[1]),
      value: normalizeValue(normalized.value.slice(valueStart, valueEnd)),
    });
  });

  return result.filter((item) => item.label && item.value);
};

const normalizeCharacteristics = (characteristics) => characteristics.flatMap(splitMergedCharacteristic);

const getParentId = (product) => {
  const title = normalizeTitle(product.title).toLowerCase();
  const sourceUrl = product.source?.url?.toLowerCase() ?? "";

  if (title.includes("термостойк")) {
    return "termostoykaya-malyarnaya";
  }

  if (title.includes("малярн") || sourceUrl.includes("malyarn")) {
    return "malyarnaya-lenta";
  }

  if (title.includes("тпл") || sourceUrl.includes("tpl") || sourceUrl.includes("santehnichesk")) {
    return "tpl";
  }

  if (title.includes("изоляц") || sourceUrl.includes("izolyacion")) {
    return "izolyatsionnaya-lenta";
  }

  if (title.includes("нанес") || sourceUrl.includes("nanesen")) {
    return "lenty-s-naneseniem";
  }

  if (title.includes("логотип") || sourceUrl.includes("logotip")) {
    return "poverhnostnaya-pechat";
  }

  return "kleikaya-lenta";
};

const getLead = (title, parentId) => {
  const purposeByParentId = {
    "malyarnaya-lenta": "для защиты поверхностей при отделочных и покрасочных работах",
    "termostoykaya-malyarnaya": "для работ с повышенной температурной нагрузкой",
    tpl: "для фиксации, ремонта, монтажа и производственных задач",
    "lenty-s-naneseniem": "для маркировки, упаковки и визуального выделения отправлений",
    "izolyatsionnaya-lenta": "для изоляции, маркировки и защиты соединений",
    "poverhnostnaya-pechat": "для брендированной упаковки и маркировки коробов",
    "kleikaya-lenta": "для упаковки, маркировки и складских задач",
  };

  return `${title} ${purposeByParentId[parentId]}.`;
};

const getDescription = (title, characteristics) => {
  const visibleCharacteristics = characteristics
    .slice(0, 4)
    .map(({ label, value }) => `${label.toLowerCase()}: ${value}`)
    .join(", ");
  const details = visibleCharacteristics ? ` Основные параметры: ${visibleCharacteristics}.` : "";

  return `${title} подходит для задач упаковки, маркировки, фиксации и комплектации заказов.${details} Точные условия поставки и наличие уточняются при заказе.`;
};

const sortProducts = (products) => products.sort((a, b) => {
  const categoryDiff = categoryOrder.indexOf(a.parentId) - categoryOrder.indexOf(b.parentId);

  if (categoryDiff !== 0) {
    return categoryDiff;
  }

  return a.title.localeCompare(b.title, "ru");
});

const draft = JSON.parse(await readFile(inputPath, "utf8"));
const seenIds = new Map();

const uniqueDraftProducts = draft.products.filter((product) => {
  const baseId = product.slug;
  const nextIndex = seenIds.get(baseId) ?? 0;

  seenIds.set(baseId, nextIndex + 1);

  return nextIndex === 0;
});

seenIds.clear();

const products = sortProducts(uniqueDraftProducts.map((product) => {
  const title = normalizeTitle(product.title);
  const parentId = getParentId(product);
  const path = categoryPaths[parentId];
  const baseId = product.slug;
  const nextIndex = seenIds.get(baseId) ?? 0;
  const uniqueSlug = nextIndex === 0 ? baseId : `${baseId}-${nextIndex + 1}`;

  seenIds.set(baseId, nextIndex + 1);

  const characteristics = normalizeCharacteristics(product.detail.specifications);
  const image = product.card.image ?? null;

  return {
    id: uniqueSlug,
    parentId,
    slug: uniqueSlug,
    href: `/catalog/${path}/${uniqueSlug}/`,
    title,
    card: {
      image,
      imageAlt: title,
      price: normalizeValue(product.card.price),
      characteristics: characteristics.slice(0, 5),
    },
    detail: {
      title,
      lead: getLead(title, parentId),
      description: getDescription(title, characteristics),
      gallery: image ? [image] : [],
      specifications: characteristics,
      advantages: [],
      order: {
        buttonLabel: "Заказать",
        target: "#request",
      },
      seo: {
        title: `${title} Newmark`,
        description: `${title} для каталога упаковочных материалов Newmark.`,
      },
    },
  };
}));

await writeFile(outputPath, `export const products = ${JSON.stringify(products, null, 2)};\n`);

const distribution = products.reduce((acc, product) => {
  acc[product.parentId] = (acc[product.parentId] ?? 0) + 1;
  return acc;
}, {});

console.log(JSON.stringify({
  sourceProducts: draft.products.length,
  skippedDuplicates: draft.products.length - uniqueDraftProducts.length,
  products: products.length,
  distribution,
}, null, 2));
