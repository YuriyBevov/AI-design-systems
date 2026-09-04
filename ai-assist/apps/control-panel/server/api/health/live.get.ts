import { healthResponseSchema } from "@ai-assist/contracts";

export default defineEventHandler(() =>
  healthResponseSchema.parse({
    status: "ok",
    service: "control-panel",
    timestamp: new Date().toISOString(),
  }),
);
