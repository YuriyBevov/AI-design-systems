import { describe, expect, it, vi } from "vitest";

import { AitunnelClient, AitunnelProviderError } from "../src/index.js";

const asFetch = (
  implementation: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
) => implementation as typeof fetch;

const jsonResponse = (value: unknown, status = 200): Response =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });

const createClient = (fetchImpl: typeof fetch, timeoutMs = 1_000) =>
  new AitunnelClient({
    baseUrl: "https://provider.test/v1",
    publicCatalogUrl: "https://provider.test/public/models",
    timeoutMs,
    maxResponseBytes: 64_000,
    fetchImpl,
  });

describe("AITUNNEL client", () => {
  it("verifies a credential without returning the key", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer sk-aitunnel-fake");
      return jsonResponse({
        name: "Pilot",
        budget: { remaining: 120.5, initial: 500 },
        allowed_models: ["model-a"],
        pii: { mode: "mask" },
      });
    });

    await expect(
      createClient(asFetch(fetchMock)).verifyCredential("sk-aitunnel-fake"),
    ).resolves.toEqual({
      keyName: "Pilot",
      budgetRemaining: 120.5,
      budgetInitial: 500,
      budgetResetAt: null,
      expiresAt: null,
      allowedModels: ["model-a"],
      piiMode: "mask",
    });
  });

  it.each([
    [401, "PROVIDER_CREDENTIAL_INVALID"],
    [402, "PROVIDER_BUDGET_EXCEEDED"],
    [429, "PROVIDER_RATE_LIMITED"],
    [502, "PROVIDER_UNAVAILABLE"],
  ] as const)("maps HTTP %s to %s", async (status, code) => {
    const client = createClient(asFetch(async () => jsonResponse({ error: {} }, status)));

    await expect(client.verifyCredential("sk-aitunnel-fake")).rejects.toMatchObject({ code });
  });

  it("maps a network timeout without exposing a response", async () => {
    const client = createClient(
      asFetch(
        async (_input, init) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () =>
              reject(new DOMException("Aborted", "AbortError")),
            );
          }),
      ),
      10,
    );

    await expect(client.verifyCredential("sk-aitunnel-fake")).rejects.toMatchObject({
      code: "PROVIDER_TIMEOUT",
    });
  });

  it("normalizes public model groups", async () => {
    const client = createClient(
      asFetch(async (input) => {
        const capability = String(input).split("/").at(-1);
        return jsonResponse({
          [`${capability}-model`]: {
            provider: "example",
            description: "Test model",
            modalities: {
              input: ["text"],
              output:
                capability === "chat"
                  ? ["text"]
                  : [capability === "rerank" ? "rerank" : "embedding"],
            },
            prompt_cost: 1.5,
            max_tokens: 8192,
          },
        });
      }),
    );

    const catalog = await client.fetchModelCatalog();
    expect(catalog.chat[0]).toMatchObject({
      id: "chat-model",
      capability: "chat",
      inputModalities: ["text"],
      outputModalities: ["text"],
      pricing: { promptCost: 1.5 },
    });
    expect(catalog.embeddings[0]?.capability).toBe("embeddings");
    expect(catalog.rerank[0]?.capability).toBe("rerank");
  });

  it("parses streaming deltas, usage and completion", async () => {
    const stream = [
      'data: {"model":"model-a","choices":[{"delta":{"content":"При"}}]}\n\n',
      'data: {"model":"model-a","choices":[{"delta":{"content":"вет"},"finish_reason":"stop"}],"usage":{"prompt_tokens":3,"completion_tokens":2}}\n\n',
      "data: [DONE]\n\n",
    ];
    const client = createClient(
      asFetch(async (_input, init) => {
        expect(JSON.parse(String(init?.body))).toMatchObject({
          model: "model-a",
          max_tokens: 100,
          temperature: 0.2,
          stream: true,
        });
        return new Response(
          new ReadableStream({
            start(controller) {
              for (const chunk of stream) controller.enqueue(new TextEncoder().encode(chunk));
              controller.close();
            },
          }),
          { status: 200, headers: { "content-type": "text/event-stream" } },
        );
      }),
    );

    const events = [];
    for await (const event of client.streamChat({
      apiKey: "sk-aitunnel-fake",
      model: "model-a",
      messages: [{ role: "user", content: "Привет" }],
      maxOutputTokens: 100,
      temperature: 0.2,
    })) {
      events.push(event);
    }

    expect(events).toEqual([
      { type: "delta", text: "При" },
      { type: "delta", text: "вет" },
      { type: "done", finishReason: "stop", model: "model-a" },
      { type: "usage", inputTokens: 3, outputTokens: 2 },
    ]);
  });

  it("rejects malformed stream chunks", async () => {
    const client = createClient(
      asFetch(async () => new Response("data: not-json\n\n", { status: 200 })),
    );

    const consume = async () => {
      const iterator = client.streamChat({
        apiKey: "sk-aitunnel-fake",
        model: "model-a",
        messages: [{ role: "user", content: "test" }],
        maxOutputTokens: 100,
      });
      await iterator.next();
    };

    await expect(consume()).rejects.toBeInstanceOf(AitunnelProviderError);
    await expect(consume()).rejects.toMatchObject({ code: "PROVIDER_BAD_RESPONSE" });
  });

  it("applies the timeout to the complete stream", async () => {
    const client = createClient(
      asFetch(
        async (_input, init) =>
          new Response(
            new ReadableStream({
              start(controller) {
                init?.signal?.addEventListener("abort", () =>
                  controller.error(new DOMException("Aborted", "AbortError")),
                );
              },
            }),
            { status: 200, headers: { "content-type": "text/event-stream" } },
          ),
      ),
    );

    const consume = async () => {
      const iterator = client.streamChat({
        apiKey: "sk-aitunnel-fake",
        model: "model-a",
        messages: [{ role: "user", content: "test" }],
        maxOutputTokens: 100,
        timeoutMs: 10,
      });
      await iterator.next();
    };

    await expect(consume()).rejects.toMatchObject({ code: "PROVIDER_TIMEOUT" });
  });

  it("normalizes embeddings and usage", async () => {
    const client = createClient(
      asFetch(async () =>
        jsonResponse({
          model: "embed-a",
          data: [
            { index: 1, embedding: [0.3, 0.4] },
            { index: 0, embedding: [0.1, 0.2] },
          ],
          usage: { prompt_tokens: 4 },
        }),
      ),
    );

    await expect(
      client.createEmbeddings({
        apiKey: "sk-aitunnel-fake",
        model: "embed-a",
        values: ["a", "b"],
      }),
    ).resolves.toEqual({
      embeddings: [
        [0.1, 0.2],
        [0.3, 0.4],
      ],
      model: "embed-a",
      inputTokens: 4,
    });
  });
});
