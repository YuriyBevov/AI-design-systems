export type BoxDimensions = {
  lengthMm: number;
  widthMm: number;
  heightMm: number;
};

export type QualificationState = {
  dimensions: BoxDimensions | null;
  quantity: number | null;
  material: string | null;
  printingRequired: boolean | null;
};

export const emptyQualificationState = (): QualificationState => ({
  dimensions: null,
  quantity: null,
  material: null,
  printingRequired: null,
});

const toMillimeters = (value: number, unit: string | undefined): number => {
  if (unit === "см") return value * 10;
  if (unit === "м") return value * 1_000;
  return value;
};

const parseDimensions = (message: string): BoxDimensions | null => {
  const match = message.match(
    /(?:^|\D)(\d{1,5}(?:[.,]\d{1,2})?)\s*[xх×*]\s*(\d{1,5}(?:[.,]\d{1,2})?)\s*[xх×*]\s*(\d{1,5}(?:[.,]\d{1,2})?)\s*(мм|см|м)?(?:\D|$)/iu,
  );
  if (!match) return null;
  const values = match.slice(1, 4).map((value) => Number(value?.replace(",", ".")));
  if (values.some((value) => !Number.isFinite(value) || value <= 0)) return null;
  const [length, width, height] = values as [number, number, number];
  const dimensions = {
    lengthMm: toMillimeters(length, match[4]),
    widthMm: toMillimeters(width, match[4]),
    heightMm: toMillimeters(height, match[4]),
  };
  return Object.values(dimensions).some((value) => value > 100_000) ? null : dimensions;
};

const parseQuantity = (message: string): number | null => {
  const match = message.match(/(?:^|\D)(\d{1,7})\s*(?:шт\.?|штук\w*|короб\w*)(?:\D|$)/iu);
  if (!match?.[1]) return null;
  const quantity = Number(match[1]);
  return Number.isInteger(quantity) && quantity > 0 && quantity <= 10_000_000 ? quantity : null;
};

const parseMaterial = (message: string): string | null => {
  const normalized = message.toLocaleLowerCase("ru-RU");
  if (/пяти[ -]?слойн/u.test(normalized)) return "пятислойный гофрокартон";
  if (/тр[её]х[ -]?слойн/u.test(normalized)) return "трёхслойный гофрокартон";
  if (/микро[ -]?гофро/u.test(normalized)) return "микрогофрокартон";
  return null;
};

const parsePrintingRequired = (message: string): boolean | null => {
  const normalized = message.toLocaleLowerCase("ru-RU");
  if (
    /(?:без|не\s+нуж[\p{L}-]*)\s+(?:печа[\p{L}-]*|логотип[\p{L}-]*|брендир[\p{L}-]*)/u.test(
      normalized,
    ) ||
    /(?:печа[\p{L}-]*|логотип[\p{L}-]*|брендир[\p{L}-]*)\s+не\s+нуж[\p{L}-]*/u.test(normalized)
  )
    return false;
  if (/(?:печа\w*|логотип\w*|брендир\w*)/u.test(normalized)) return true;
  return null;
};

export const updateQualificationState = (
  current: QualificationState,
  message: string,
): QualificationState => ({
  dimensions: parseDimensions(message) ?? current.dimensions,
  quantity: parseQuantity(message) ?? current.quantity,
  material: parseMaterial(message) ?? current.material,
  printingRequired: parsePrintingRequired(message) ?? current.printingRequired,
});

export const formatQualificationState = (state: QualificationState): string => {
  const values = [
    state.dimensions
      ? `Размеры: ${state.dimensions.lengthMm}×${state.dimensions.widthMm}×${state.dimensions.heightMm} мм`
      : null,
    state.quantity ? `Количество: ${state.quantity} шт.` : null,
    state.material ? `Материал: ${state.material}` : null,
    state.printingRequired === null
      ? null
      : `Печать/брендирование: ${state.printingRequired ? "требуется" : "не требуется"}`,
  ].filter((value): value is string => Boolean(value));
  return values.length ? values.join("\n") : "Подтверждённые параметры пока не собраны.";
};
