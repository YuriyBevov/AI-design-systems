import { describe, expect, it } from "vitest";

import { knowledgeIndexJobDataSchema } from "../src/system-jobs.js";

describe("system job contracts", () => {
  it("accepts identifiers but rejects secrets in an indexing job", () => {
    const base = {
      projectId: "a85e04ac-c414-4262-88d8-6e15386a1b3d",
      indexVersionId: "b85e04ac-c414-4262-88d8-6e15386a1b3d",
      requestedAt: "2026-09-02T12:00:00.000Z",
      requestId: "req-index",
    };
    expect(knowledgeIndexJobDataSchema.safeParse(base).success).toBe(true);
    expect(knowledgeIndexJobDataSchema.safeParse({ ...base, apiKey: "forbidden" }).success).toBe(
      false,
    );
  });
});
