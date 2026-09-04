import { describe, expect, it } from "vitest";

import { healthResponseSchema } from "../src/index.js";

describe("healthResponseSchema", () => {
  it("accepts a valid liveness response", () => {
    const parsed = healthResponseSchema.parse({
      status: "ok",
      service: "control-panel",
      timestamp: "2026-09-01T12:00:00.000Z",
    });

    expect(parsed.status).toBe("ok");
  });

  it("rejects an unknown status", () => {
    expect(() =>
      healthResponseSchema.parse({
        status: "unknown",
        service: "control-panel",
        timestamp: "2026-09-01T12:00:00.000Z",
      }),
    ).toThrow();
  });
});
