import { describe, expect, it } from "vitest";

import {
  isRetryableKnowledgeProcessingErrorCode,
  knowledgeProcessingItemMaxAttempts,
  knowledgeProcessingRetryDelayMs,
} from "../src/knowledge-processing.js";

describe("knowledge processing item retries", () => {
  it("limits automatic processing to three attempts per item", () => {
    expect(knowledgeProcessingItemMaxAttempts).toBe(3);
  });

  it.each([
    "PROVIDER_RATE_LIMITED",
    "PROVIDER_TIMEOUT",
    "PROVIDER_BAD_RESPONSE",
    "PROVIDER_UNAVAILABLE",
    "CRAWL_AI_RESPONSE_INVALID",
  ])("retries transient error %s", (code) => {
    expect(isRetryableKnowledgeProcessingErrorCode(code)).toBe(true);
  });

  it.each([
    "CREDENTIAL_KEY_VERSION_UNAVAILABLE",
    "KNOWLEDGE_PROCESSING_VERSION_CONFLICT",
    "KNOWLEDGE_PROCESSING_DOCUMENT_UNAVAILABLE",
  ])("does not retry permanent error %s", (code) => {
    expect(isRetryableKnowledgeProcessingErrorCode(code)).toBe(false);
  });

  it("uses bounded exponential delays between retry rounds", () => {
    expect([1, 2, 3, 4].map(knowledgeProcessingRetryDelayMs)).toEqual([
      2_000, 4_000, 8_000, 10_000,
    ]);
  });
});
