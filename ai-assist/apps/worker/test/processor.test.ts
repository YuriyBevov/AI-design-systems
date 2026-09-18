import { describe, expect, it, vi } from "vitest";

import { processSystemJob } from "../src/processor.js";

describe("processSystemJob", () => {
  const dependencies = {
    processKnowledgeCrawl: async () => {
      throw new Error("not expected");
    },
    processKnowledgeIndex: async () => {
      throw new Error("not expected");
    },
    processKnowledgeProcessing: async () => {
      throw new Error("not expected");
    },
  };

  it("responds to a valid system ping", async () => {
    const result = await processSystemJob(
      "system.ping",
      {
        requestedAt: "2026-09-01T12:00:00.000Z",
        requestId: "req_test",
      },
      "worker-test",
      dependencies,
    );

    expect("workerId" in result).toBe(true);
    if (!("workerId" in result)) throw new Error("Expected a ping result");
    expect(result.workerId).toBe("worker-test");
    expect(result.respondedAt).toMatch(/Z$/);
  });

  it("dispatches a validated knowledge index job", async () => {
    const processKnowledgeIndex = vi.fn(async () => ({
      indexVersionId: "b85e04ac-c414-4262-88d8-6e15386a1b3d",
      projectId: "a85e04ac-c414-4262-88d8-6e15386a1b3d",
      status: "active" as const,
      documentCount: 1,
      chunkCount: 2,
      embeddingDimension: 3,
      inputTokens: 4,
    }));
    await processSystemJob(
      "knowledge.index",
      {
        projectId: "a85e04ac-c414-4262-88d8-6e15386a1b3d",
        indexVersionId: "b85e04ac-c414-4262-88d8-6e15386a1b3d",
        requestedAt: "2026-09-02T12:00:00.000Z",
        requestId: "req-test",
      },
      "worker-test",
      { ...dependencies, processKnowledgeIndex },
    );
    expect(processKnowledgeIndex).toHaveBeenCalledOnce();
  });

  it("dispatches a validated knowledge crawl job", async () => {
    const processKnowledgeCrawl = vi.fn(async () => ({
      runId: "c85e04ac-c414-4262-88d8-6e15386a1b3d",
      projectId: "a85e04ac-c414-4262-88d8-6e15386a1b3d",
      status: "succeeded" as const,
      processedCount: 2,
      succeededCount: 2,
      failedCount: 0,
    }));
    await processSystemJob(
      "knowledge.crawl",
      {
        projectId: "a85e04ac-c414-4262-88d8-6e15386a1b3d",
        sourceId: "b85e04ac-c414-4262-88d8-6e15386a1b3d",
        runId: "c85e04ac-c414-4262-88d8-6e15386a1b3d",
        requestedAt: "2026-09-02T12:00:00.000Z",
        requestId: "req-test",
      },
      "worker-test",
      { ...dependencies, processKnowledgeCrawl },
    );
    expect(processKnowledgeCrawl).toHaveBeenCalledOnce();
  });

  it("dispatches a validated knowledge processing job", async () => {
    const processKnowledgeProcessing = vi.fn(async () => ({
      runId: "c85e04ac-c414-4262-88d8-6e15386a1b3d",
      projectId: "a85e04ac-c414-4262-88d8-6e15386a1b3d",
      status: "succeeded" as const,
      processedCount: 2,
      succeededCount: 2,
      failedCount: 0,
    }));
    await processSystemJob(
      "knowledge.processing",
      {
        projectId: "a85e04ac-c414-4262-88d8-6e15386a1b3d",
        runId: "c85e04ac-c414-4262-88d8-6e15386a1b3d",
        requestedAt: "2026-09-17T12:00:00.000Z",
        requestId: "req-test",
      },
      "worker-test",
      { ...dependencies, processKnowledgeProcessing },
    );
    expect(processKnowledgeProcessing).toHaveBeenCalledOnce();
  });

  it("accepts a cooperatively cancelled knowledge processing result", async () => {
    const processKnowledgeProcessing = vi.fn(async () => ({
      runId: "c85e04ac-c414-4262-88d8-6e15386a1b3d",
      projectId: "a85e04ac-c414-4262-88d8-6e15386a1b3d",
      status: "cancelled" as const,
      processedCount: 7,
      succeededCount: 6,
      failedCount: 1,
    }));
    const result = await processSystemJob(
      "knowledge.processing",
      {
        projectId: "a85e04ac-c414-4262-88d8-6e15386a1b3d",
        runId: "c85e04ac-c414-4262-88d8-6e15386a1b3d",
        requestedAt: "2026-09-18T07:00:00.000Z",
        requestId: "req-test",
      },
      "worker-test",
      { ...dependencies, processKnowledgeProcessing },
    );
    expect("status" in result && result.status).toBe("cancelled");
  });

  it("rejects an unsupported job", async () => {
    await expect(processSystemJob("unknown", {}, "worker-test", dependencies)).rejects.toThrow(
      "Unsupported system job",
    );
  });
});
