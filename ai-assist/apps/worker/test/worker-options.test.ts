import { describe, expect, it } from "vitest";

import { systemWorkerOptions } from "../src/worker-options.js";

describe("system worker options", () => {
  it("keeps long ingestion jobs leased across transient renewal delays", () => {
    expect(systemWorkerOptions.lockDuration).toBe(600_000);
    expect(systemWorkerOptions.lockRenewTime).toBeLessThan(systemWorkerOptions.lockDuration / 2);
    expect(systemWorkerOptions.stalledInterval).toBe(60_000);
    expect(systemWorkerOptions.maxStalledCount).toBe(3);
  });

  it("retains bounded top-level job concurrency", () => {
    expect(systemWorkerOptions.concurrency).toBe(2);
  });
});
