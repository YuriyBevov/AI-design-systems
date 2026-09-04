import { createServer } from "node:http";

const port = Number(process.env.AI_ASSIST_MOCK_AITUNNEL_PORT ?? 3310);
const acceptedAuthorization = "Bearer sk-aitunnel-smoke-fake-key-0000";

const sendJson = (response, status, value) => {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(value));
};

const readJsonBody = async (request) => {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 64_000) throw new Error("Request body is too large");
  }
  return JSON.parse(body);
};

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

  if (url.pathname === "/v1/aitunnel/key") {
    if (request.headers.authorization !== acceptedAuthorization) {
      sendJson(response, 401, { error: { code: 401 } });
      return;
    }
    sendJson(response, 200, {
      name: "Local smoke credential",
      budget: { remaining: 100, initial: 100 },
      allowed_models: ["mock-chat", "mock-embedding"],
      pii: { mode: "mask" },
    });
    return;
  }

  if (url.pathname === "/v1/chat/completions" && request.method === "POST") {
    if (request.headers.authorization !== acceptedAuthorization) {
      sendJson(response, 401, { error: { code: 401 } });
      return;
    }
    let body;
    try {
      body = await readJsonBody(request);
    } catch {
      sendJson(response, 400, { error: { code: 400 } });
      return;
    }
    const userContent = body.messages?.at(-1)?.content;
    if (typeof userContent !== "string" || !userContent.trim()) {
      sendJson(response, 400, { error: { code: 400 } });
      return;
    }
    const previewMarker = "Вопрос пользователя:\n\n";
    const widgetMarker = "Текущее сообщение пользователя:\n";
    const questionMarker = userContent.includes(previewMarker) ? previewMarker : widgetMarker;
    const markerIndex = userContent.lastIndexOf(questionMarker);
    const question =
      markerIndex >= 0 ? userContent.slice(markerIndex + questionMarker.length) : userContent;
    const model = typeof body.model === "string" ? body.model : "mock-chat";
    const answer = `Mock preview: ${question.trim()}`;
    response.writeHead(200, { "content-type": "text/event-stream" });
    response.end(
      `data: ${JSON.stringify({ model, choices: [{ delta: { content: answer } }] })}\n\n` +
        `data: ${JSON.stringify({
          model,
          choices: [{ delta: {}, finish_reason: "stop" }],
          usage: { prompt_tokens: 12, completion_tokens: 4 },
        })}\n\n` +
        "data: [DONE]\n\n",
    );
    return;
  }

  if (url.pathname === "/v1/embeddings" && request.method === "POST") {
    if (request.headers.authorization !== acceptedAuthorization) {
      sendJson(response, 401, { error: { code: 401 } });
      return;
    }
    let body;
    try {
      body = await readJsonBody(request);
    } catch {
      sendJson(response, 400, { error: { code: 400 } });
      return;
    }
    const values = Array.isArray(body.input) ? body.input : [body.input];
    if (!values.length || values.some((value) => typeof value !== "string")) {
      sendJson(response, 400, { error: { code: 400 } });
      return;
    }
    sendJson(response, 200, {
      model: "mock-embedding",
      data: values.map((value, index) => ({
        index,
        embedding: [
          Math.min(1, value.length / 1_000),
          value.toLocaleLowerCase("ru-RU").includes("достав") ? 1 : 0,
          value.toLocaleLowerCase("ru-RU").includes("гофро") ? 1 : 0,
        ],
      })),
      usage: { prompt_tokens: values.length },
    });
    return;
  }

  sendJson(response, 404, { error: { code: 404 } });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Mock AITUNNEL listening on http://127.0.0.1:${port}`);
});

const close = () => server.close(() => process.exit(0));
process.on("SIGINT", close);
process.on("SIGTERM", close);
