import { describe, expect, it } from "vitest";

import { catalogRecordSchema, catalogSourceTypeSchema, productLookupSchema } from "../src/index.js";

describe("catalog source contracts", () => {
  it("limits the pilot to public and manually managed sources", () => {
    expect(catalogSourceTypeSchema.safeParse("url").success).toBe(true);
    expect(catalogSourceTypeSchema.safeParse("feed").success).toBe(true);
    expect(catalogSourceTypeSchema.safeParse("mysql").success).toBe(false);
    expect(catalogSourceTypeSchema.safeParse("api").success).toBe(false);
    expect(catalogSourceTypeSchema.safeParse("file").success).toBe(false);
  });

  it("accepts a normalized product without database details", () => {
    const record = catalogRecordSchema.parse({
      externalId: "555",
      sku: "00555",
      title: "Коробка конструкции «самолет»",
      priceAmount: 42.53,
      priceDisplay: "от 42,53 ₽/шт",
      currency: "RUB",
    });

    expect(record.characteristics).toEqual({});
  });

  it("requires a bounded product identity for live lookup", () => {
    expect(productLookupSchema.safeParse({}).success).toBe(false);
    expect(productLookupSchema.safeParse({ sku: "00555" }).success).toBe(true);
  });
});
