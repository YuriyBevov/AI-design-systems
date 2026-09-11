import { z } from "zod";

export const catalogSourceTypeSchema = z.enum(["feed", "url", "manual", "product"]);

export const catalogRecordSchema = z.object({
  externalId: z.string().min(1).max(255),
  sku: z.string().min(1).max(255),
  title: z.string().min(1).max(500),
  canonicalUrl: z.string().url().optional(),
  category: z.string().max(500).optional(),
  description: z.string().max(100_000).optional(),
  priceAmount: z.number().nonnegative().optional(),
  priceDisplay: z.string().max(255).optional(),
  currency: z.string().length(3).optional(),
  availability: z.string().max(255).optional(),
  minimumOrder: z.number().nonnegative().optional(),
  characteristics: z.record(z.string(), z.string()).default({}),
  sourceUpdatedAt: z.string().datetime().optional(),
});

export const freshProductFieldsSchema = catalogRecordSchema
  .pick({
    externalId: true,
    sku: true,
    priceAmount: true,
    priceDisplay: true,
    currency: true,
    availability: true,
    minimumOrder: true,
  })
  .extend({
    checkedAt: z.string().datetime(),
    provenance: z.string().min(1).max(255),
  });

export const productLookupSchema = z
  .object({
    externalId: z.string().min(1).max(255).optional(),
    sku: z.string().min(1).max(255).optional(),
  })
  .refine((input) => Boolean(input.externalId || input.sku), {
    message: "Укажите внешний идентификатор или артикул",
  });

export type CatalogSourceType = z.infer<typeof catalogSourceTypeSchema>;
export type CatalogRecord = z.infer<typeof catalogRecordSchema>;
export type FreshProductFields = z.infer<typeof freshProductFieldsSchema>;
export type ProductLookup = z.infer<typeof productLookupSchema>;

export interface CatalogSourceAdapter {
  verify(): Promise<{ status: "ok"; schemaFingerprint: string }>;
  sync(cursor?: string): AsyncIterable<CatalogRecord>;
  lookupFresh?(input: ProductLookup): Promise<FreshProductFields | null>;
}
