export const modelCapabilities = ["chat", "embeddings", "rerank"] as const;
export type ModelCapability = (typeof modelCapabilities)[number];

export type AitunnelModel = {
  id: string;
  capability: ModelCapability;
  upstreamProvider: string | null;
  description: string | null;
  inputModalities: string[];
  outputModalities: string[];
  contextSize: number | null;
  maxOutput: number | null;
  maxTokens: number | null;
  pricing: Record<string, number>;
  createdAt: Date | null;
  rawChecksum: string;
};

export type CredentialVerification = {
  keyName: string | null;
  budgetRemaining: number | null;
  budgetInitial: number | null;
  budgetResetAt: string | null;
  expiresAt: string | null;
  allowedModels: string[] | null;
  piiMode: "mask" | "block" | null;
};

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type ChatStreamEvent =
  | { type: "delta"; text: string }
  | { type: "usage"; inputTokens: number | null; outputTokens: number | null }
  | { type: "done"; finishReason: string | null; model: string | null };

export type EmbeddingResult = {
  embeddings: number[][];
  model: string | null;
  inputTokens: number | null;
};
