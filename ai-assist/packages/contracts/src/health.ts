import { z } from "zod";

export const healthStatusSchema = z.enum(["ok", "degraded"]);

export const healthResponseSchema = z.object({
  status: healthStatusSchema,
  service: z.string().min(1),
  timestamp: z.string().datetime(),
  checks: z.record(z.string(), z.enum(["ok", "error"])).optional(),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
