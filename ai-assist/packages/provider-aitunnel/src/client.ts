import { createHash } from "node:crypto";

import { z } from "zod";

import { AitunnelProviderError, mapAitunnelStatus } from "./errors.js";
import { requestAitunnel, requestAitunnelJson, type AitunnelHttpOptions } from "./http.js";
import {
  modelCapabilities,
  type AitunnelModel,
  type ChatMessage,
  type ChatStreamEvent,
  type CredentialVerification,
  type EmbeddingResult,
  type ModelCapability,
} from "./types.js";

const finiteNumber = z.number().finite();
const modelSchema = z
  .object({
    provider: z.string().min(1).optional(),
    description: z.string().optional(),
    modalities: z
      .object({
        input: z.array(z.string()).default([]),
        output: z.array(z.string()).default([]),
      })
      .optional(),
    created: finiteNumber.optional(),
    context_size: finiteNumber.int().positive().optional(),
    max_output: finiteNumber.int().positive().optional(),
    max_tokens: finiteNumber.int().positive().optional(),
    prompt_cost: finiteNumber.optional(),
    completion_cost: finiteNumber.optional(),
    cache_discount: finiteNumber.optional(),
    min_price: finiteNumber.optional(),
    max_price: finiteNumber.optional(),
  })
  .passthrough();
const catalogSchema = z.record(z.string().min(1), modelSchema);

const verificationSchema = z.object({
  name: z.string().optional(),
  budget: z
    .object({
      remaining: finiteNumber.optional(),
      initial: finiteNumber.optional(),
      reset_at: z.string().datetime().optional(),
    })
    .optional(),
  expires_at: z.string().datetime().optional(),
  allowed_models: z.array(z.string()).max(500).nullable().optional(),
  pii: z
    .object({
      mode: z.enum(["mask", "block"]).nullable().optional(),
    })
    .optional(),
});

const embeddingSchema = z.object({
  model: z.string().optional(),
  data: z
    .array(
      z.object({
        embedding: z.array(finiteNumber).min(1),
        index: z.number().int().nonnegative().optional(),
      }),
    )
    .min(1),
  usage: z
    .object({
      prompt_tokens: z.number().int().nonnegative().optional(),
      total_tokens: z.number().int().nonnegative().optional(),
    })
    .optional(),
});

const chatChunkSchema = z.object({
  model: z.string().optional(),
  choices: z
    .array(
      z.object({
        delta: z.object({ content: z.string().nullable().optional() }).optional(),
        finish_reason: z.string().nullable().optional(),
      }),
    )
    .default([]),
  usage: z
    .object({
      prompt_tokens: z.number().int().nonnegative().optional(),
      completion_tokens: z.number().int().nonnegative().optional(),
    })
    .optional(),
  error: z
    .object({
      code: z.union([z.number(), z.string()]).optional(),
    })
    .optional(),
});

const checksum = (value: unknown): string =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

const catalogUrl = (baseUrl: string, capability: ModelCapability): string =>
  `${baseUrl.replace(/\/$/u, "")}/${capability}`;

const apiUrl = (baseUrl: string, path: string): string =>
  `${baseUrl.replace(/\/$/u, "")}/${path.replace(/^\//u, "")}`;

const toModel = (
  id: string,
  capability: ModelCapability,
  value: z.infer<typeof modelSchema>,
): AitunnelModel => {
  const pricingEntries = Object.entries({
    promptCost: value.prompt_cost,
    completionCost: value.completion_cost,
    cacheDiscount: value.cache_discount,
    minPrice: value.min_price,
    maxPrice: value.max_price,
  }).filter((entry): entry is [string, number] => typeof entry[1] === "number");

  return {
    id,
    capability,
    upstreamProvider: value.provider ?? null,
    description: value.description ?? null,
    inputModalities: value.modalities?.input ?? [],
    outputModalities: value.modalities?.output ?? [],
    contextSize: value.context_size ?? null,
    maxOutput: value.max_output ?? null,
    maxTokens: value.max_tokens ?? null,
    pricing: Object.fromEntries(pricingEntries),
    createdAt: value.created ? new Date(value.created * 1000) : null,
    rawChecksum: checksum(value),
  };
};

const parseChatEvent = (data: string): ChatStreamEvent[] => {
  let value: unknown;
  try {
    value = JSON.parse(data);
  } catch (error) {
    throw new AitunnelProviderError({
      code: "PROVIDER_BAD_RESPONSE",
      message: "AITUNNEL returned a malformed stream event",
      retryable: false,
      cause: error,
    });
  }

  const parsed = chatChunkSchema.safeParse(value);
  if (!parsed.success) {
    throw new AitunnelProviderError({
      code: "PROVIDER_BAD_RESPONSE",
      message: "AITUNNEL returned an unknown stream event",
      retryable: false,
    });
  }

  if (parsed.data.error) {
    const numericCode = Number(parsed.data.error.code);
    throw Number.isInteger(numericCode)
      ? mapAitunnelStatus(numericCode)
      : new AitunnelProviderError({
          code: "PROVIDER_UNAVAILABLE",
          message: "AITUNNEL stream failed",
          retryable: true,
        });
  }

  const events: ChatStreamEvent[] = [];
  for (const choice of parsed.data.choices) {
    if (choice.delta?.content) events.push({ type: "delta", text: choice.delta.content });
    if (choice.finish_reason !== undefined && choice.finish_reason !== null) {
      events.push({
        type: "done",
        finishReason: choice.finish_reason,
        model: parsed.data.model ?? null,
      });
    }
  }

  if (parsed.data.usage) {
    events.push({
      type: "usage",
      inputTokens: parsed.data.usage.prompt_tokens ?? null,
      outputTokens: parsed.data.usage.completion_tokens ?? null,
    });
  }

  return events;
};

export type AitunnelClientOptions = {
  baseUrl: string;
  publicCatalogUrl: string;
  timeoutMs?: number;
  maxResponseBytes?: number;
  fetchImpl?: typeof fetch;
};

export class AitunnelClient {
  readonly #baseUrl: string;
  readonly #publicCatalogUrl: string;
  readonly #http: AitunnelHttpOptions;

  constructor(options: AitunnelClientOptions) {
    this.#baseUrl = options.baseUrl;
    this.#publicCatalogUrl = options.publicCatalogUrl;
    this.#http = {
      timeoutMs: options.timeoutMs ?? 8_000,
      maxResponseBytes: options.maxResponseBytes ?? 262_144,
      fetchImpl: options.fetchImpl ?? fetch,
    };
  }

  async verifyCredential(apiKey: string): Promise<CredentialVerification> {
    const parsed = await requestAitunnelJson(
      apiUrl(this.#baseUrl, "aitunnel/key"),
      {
        method: "GET",
        headers: { authorization: `Bearer ${apiKey}`, accept: "application/json" },
      },
      this.#http,
      (value) => verificationSchema.parse(value),
    );

    return {
      keyName: parsed.name ?? null,
      budgetRemaining: parsed.budget?.remaining ?? null,
      budgetInitial: parsed.budget?.initial ?? null,
      budgetResetAt: parsed.budget?.reset_at ?? null,
      expiresAt: parsed.expires_at ?? null,
      allowedModels: parsed.allowed_models ?? null,
      piiMode: parsed.pii?.mode ?? null,
    };
  }

  async fetchModelCatalog(
    capabilities: readonly ModelCapability[] = modelCapabilities,
  ): Promise<Record<ModelCapability, AitunnelModel[]>> {
    const entries = await Promise.all(
      capabilities.map(async (capability) => {
        const catalog = await requestAitunnelJson(
          catalogUrl(this.#publicCatalogUrl, capability),
          { method: "GET", headers: { accept: "application/json" } },
          this.#http,
          (value) => catalogSchema.parse(value),
        );
        return [
          capability,
          Object.entries(catalog).map(([id, model]) => toModel(id, capability, model)),
        ] as const;
      }),
    );

    const result: Record<ModelCapability, AitunnelModel[]> = {
      chat: [],
      embeddings: [],
      rerank: [],
    };
    for (const [capability, models] of entries) result[capability] = models;
    return result;
  }

  async *streamChat(input: {
    apiKey: string;
    model: string;
    messages: ChatMessage[];
    maxOutputTokens: number;
    temperature?: number | null;
    timeoutMs?: number;
    signal?: AbortSignal;
  }): AsyncGenerator<ChatStreamEvent> {
    const timeoutMs = input.timeoutMs ?? this.#http.timeoutMs;
    const streamTimeoutController = new AbortController();
    const timeout = setTimeout(() => streamTimeoutController.abort(), timeoutMs);
    const signal = input.signal
      ? AbortSignal.any([input.signal, streamTimeoutController.signal])
      : streamTimeoutController.signal;

    try {
      const response = await requestAitunnel(
        apiUrl(this.#baseUrl, "chat/completions"),
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${input.apiKey}`,
            accept: "text/event-stream",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model: input.model,
            messages: input.messages,
            max_tokens: input.maxOutputTokens,
            stream: true,
            stream_options: { include_usage: true },
            ...(input.temperature === undefined || input.temperature === null
              ? {}
              : { temperature: input.temperature }),
          }),
          signal,
        },
        { ...this.#http, timeoutMs },
      );

      if (!response.body) {
        throw new AitunnelProviderError({
          code: "PROVIDER_BAD_RESPONSE",
          message: "AITUNNEL stream body is missing",
          retryable: false,
        });
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let totalBytes = 0;
      let emittedDone = false;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        totalBytes += value.byteLength;
        if (totalBytes > this.#http.maxResponseBytes) {
          await reader.cancel();
          throw new AitunnelProviderError({
            code: "PROVIDER_BAD_RESPONSE",
            message: "AITUNNEL stream exceeded the configured size limit",
            retryable: false,
          });
        }

        buffer += decoder.decode(value, { stream: true }).replace(/\r\n/gu, "\n");
        let boundary = buffer.indexOf("\n\n");
        while (boundary >= 0) {
          const block = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          const data = block
            .split("\n")
            .filter((line) => line.startsWith("data:"))
            .map((line) => line.slice(5).trimStart())
            .join("\n");

          if (data === "[DONE]") {
            if (!emittedDone) {
              emittedDone = true;
              yield { type: "done", finishReason: null, model: null };
            }
          } else if (data) {
            for (const event of parseChatEvent(data)) {
              if (event.type === "done") emittedDone = true;
              yield event;
            }
          }
          boundary = buffer.indexOf("\n\n");
        }
      }

      if (!emittedDone) {
        throw new AitunnelProviderError({
          code: "PROVIDER_BAD_RESPONSE",
          message: "AITUNNEL stream ended without a completion marker",
          retryable: false,
        });
      }
    } catch (error) {
      if (streamTimeoutController.signal.aborted) {
        throw new AitunnelProviderError({
          code: "PROVIDER_TIMEOUT",
          message: "AITUNNEL stream timed out",
          retryable: true,
          cause: error,
        });
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  async createEmbeddings(input: {
    apiKey: string;
    model: string;
    values: string[];
    signal?: AbortSignal;
  }): Promise<EmbeddingResult> {
    const parsed = await requestAitunnelJson(
      apiUrl(this.#baseUrl, "embeddings"),
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${input.apiKey}`,
          accept: "application/json",
          "content-type": "application/json",
        },
        body: JSON.stringify({ model: input.model, input: input.values }),
        ...(input.signal ? { signal: input.signal } : {}),
      },
      this.#http,
      (value) => embeddingSchema.parse(value),
    );

    const sorted = [...parsed.data].sort((left, right) => (left.index ?? 0) - (right.index ?? 0));
    return {
      embeddings: sorted.map((item) => item.embedding),
      model: parsed.model ?? null,
      inputTokens: parsed.usage?.prompt_tokens ?? parsed.usage?.total_tokens ?? null,
    };
  }
}
