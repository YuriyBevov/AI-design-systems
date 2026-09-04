import { randomUUID } from "node:crypto";

import { createDatabase } from "../packages/database/dist/src/index.js";

const baseUrl = process.env.AI_ASSIST_SMOKE_BASE_URL ?? "http://localhost:3100";
const password = process.env.AI_ASSIST_DEV_OWNER_PASSWORD ?? "LocalDev-ChangeMe-2026!";
const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://ai_assist:change-me-local-only@localhost:55432/ai_assist";
const widgetOrigin = "https://widget-smoke.example";
const wrongOrigin = "https://foreign-widget-smoke.example";
const syntheticKey = "sk-aitunnel-smoke-fake-key-0000";
const projectId = randomUUID();
const projectSlug = `widget-chat-smoke-${projectId}`;
const modelId = `mock-widget-${projectId}`;
const database = createDatabase(databaseUrl);
let projectCreated = false;

const assertStatus = (response, expected, label) => {
  if (response.status !== expected) {
    throw new Error(`${label}: expected ${expected}, received ${response.status}`);
  }
};

const awaitText = async (response) => response.text().catch(() => "<unreadable response>");

const requestJson = async (path, init, expected, label) => {
  const response = await fetch(`${baseUrl}${path}`, init);
  if (response.status !== expected) {
    throw new Error(
      `${label}: expected ${expected}, received ${response.status}: ${await awaitText(response)}`,
    );
  }
  return response.json();
};

const loginOriginHeaders = { origin: baseUrl, "sec-fetch-site": "same-origin" };
const login = await fetch(`${baseUrl}/api/v1/auth/login`, {
  method: "POST",
  headers: { ...loginOriginHeaders, "content-type": "application/json" },
  body: JSON.stringify({ email: "owner@gofroprodpak.local", password }),
});
assertStatus(login, 200, "login");
const loginBody = await login.json();
if (!loginBody.user?.id || !loginBody.csrfToken) throw new Error("login response is incomplete");
const cookieHeader = login.headers
  .getSetCookie()
  .map((cookie) => cookie.split(";", 1)[0])
  .join("; ");
const authenticatedHeaders = { cookie: cookieHeader };
const mutationHeaders = {
  ...loginOriginHeaders,
  ...authenticatedHeaders,
  "content-type": "application/json",
  "x-csrf-token": loginBody.csrfToken,
};
const widgetHeaders = { origin: widgetOrigin, "content-type": "application/json" };

const createPublicSession = async () => {
  const response = await fetch(`${baseUrl}/api/v1/widget/sessions`, {
    method: "POST",
    headers: widgetHeaders,
    body: JSON.stringify({ assistantId, widgetVersion: "1.0.0", locale: "ru-RU" }),
  });
  if (response.status !== 200) {
    throw new Error(
      `create widget session failed: ${response.status}: ${await awaitText(response)}`,
    );
  }
  if (response.headers.get("access-control-allow-origin") !== widgetOrigin) {
    throw new Error("widget session response does not contain the exact CORS Origin");
  }
  return response.json();
};

const chat = async ({ token, conversationId, message, idempotencyKey }) =>
  fetch(`${baseUrl}/api/v1/widget/chat`, {
    method: "POST",
    headers: {
      ...widgetHeaders,
      authorization: `Bearer ${token}`,
      "idempotency-key": idempotencyKey,
    },
    body: JSON.stringify({
      conversationId,
      message,
      page: { url: `${widgetOrigin}/catalog`, title: "Каталог" },
    }),
  });

const parseSse = (text) =>
  text
    .replaceAll("\r\n", "\n")
    .split("\n\n")
    .map((block) => {
      const event = block
        .split("\n")
        .find((line) => line.startsWith("event:"))
        ?.slice(6)
        .trim();
      const data = block
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
        .join("\n");
      return event && data ? { event, data: JSON.parse(data) } : null;
    })
    .filter(Boolean);

let assistantId;
try {
  await database.client`
    insert into projects (id, name, slug, primary_origin, timezone, default_locale)
    values (
      ${projectId},
      'Widget chat smoke',
      ${projectSlug},
      ${widgetOrigin},
      'Europe/Moscow',
      'ru-RU'
    )
  `;
  projectCreated = true;
  await database.client`
    insert into project_memberships (project_id, user_id, role)
    values (${projectId}, ${loginBody.user.id}, 'owner')
  `;
  await database.client`
    insert into provider_model_catalog (
      provider,
      model_id,
      capability,
      upstream_provider,
      input_modalities,
      output_modalities,
      max_output,
      max_tokens,
      pricing,
      available,
      fetched_at,
      raw_checksum
    ) values (
      'aitunnel',
      ${modelId},
      'chat',
      'mock',
      '["text"]'::jsonb,
      '["text"]'::jsonb,
      256,
      4096,
      '{}'::jsonb,
      true,
      now(),
      ${"1".repeat(64)}
    )
  `;

  await requestJson(
    `/api/v1/projects/${projectId}/provider/credential`,
    {
      method: "PUT",
      headers: mutationHeaders,
      body: JSON.stringify({ apiKey: syntheticKey }),
    },
    200,
    "save widget smoke credential",
  );
  await requestJson(
    `/api/v1/projects/${projectId}/model-settings`,
    {
      method: "PUT",
      headers: mutationHeaders,
      body: JSON.stringify({ chatModelId: modelId, maxOutputTokens: 128, temperature: 0.2 }),
    },
    200,
    "select widget smoke model",
  );

  const assistant = await requestJson(
    `/api/v1/projects/${projectId}/assistant`,
    { headers: authenticatedHeaders },
    200,
    "initialize widget smoke assistant",
  );
  assistantId = assistant.assistant.publicId;
  if (!assistantId?.startsWith("asst_")) throw new Error("assistant public id is missing");

  const prompt = await requestJson(
    `/api/v1/projects/${projectId}/prompts`,
    {
      method: "POST",
      headers: mutationHeaders,
      body: JSON.stringify({
        name: "Widget smoke prompt",
        content: "Ты консультант {{assistant.name}}. Отвечай кратко и учитывай историю беседы.",
      }),
    },
    200,
    "create widget smoke prompt",
  );
  await requestJson(
    `/api/v1/projects/${projectId}/prompts/${prompt.prompt.id}/publish`,
    {
      method: "POST",
      headers: mutationHeaders,
      body: JSON.stringify({
        expectedVersion: prompt.prompt.version,
        revisionId: prompt.revisions[0].id,
      }),
    },
    200,
    "publish widget smoke prompt",
  );

  const knowledge = await requestJson(
    `/api/v1/projects/${projectId}/knowledge/documents`,
    {
      method: "POST",
      headers: mutationHeaders,
      body: JSON.stringify({
        type: "product",
        title: "Короб 400×300×250 мм",
        content: "Трёхслойный гофрокороб размером 400×300×250 мм. Минимальный заказ — 100 штук.",
        canonicalUrl: `${widgetOrigin}/catalog/box-400-300-250`,
        locale: "ru-RU",
        tags: ["короб", "трёхслойный"],
        product: {
          externalId: "SMOKE-BOX-1",
          sku: "SMOKE-BOX-1",
          category: "Гофрокороба",
          priceDisplay: null,
          priceAmount: null,
          currency: null,
          availability: "in_stock",
          minimumOrder: 100,
          characteristics: { material: "трёхслойный гофрокартон" },
        },
      }),
    },
    200,
    "create widget smoke knowledge",
  );
  await requestJson(
    `/api/v1/projects/${projectId}/knowledge/documents/${knowledge.document.id}/publish`,
    {
      method: "POST",
      headers: mutationHeaders,
      body: JSON.stringify({
        expectedVersion: knowledge.document.version,
        versionId: knowledge.versions[0].id,
      }),
    },
    200,
    "publish widget smoke knowledge",
  );

  const preflight = await fetch(`${baseUrl}/api/v1/widget/chat`, {
    method: "OPTIONS",
    headers: {
      origin: widgetOrigin,
      "access-control-request-method": "POST",
      "access-control-request-headers": "authorization,content-type,idempotency-key",
    },
  });
  assertStatus(preflight, 204, "widget preflight");
  if (preflight.headers.get("access-control-allow-origin") !== widgetOrigin) {
    throw new Error("widget preflight does not reflect the exact Origin");
  }

  const session = await createPublicSession();
  if (
    !session.sessionToken ||
    session.conversation !== null ||
    session.config.name !== assistant.draft.name ||
    JSON.stringify(session).includes(syntheticKey)
  ) {
    throw new Error("public widget session response is incomplete or leaked a secret");
  }

  const firstKey = randomUUID();
  const firstResponse = await chat({
    token: session.sessionToken,
    conversationId: null,
    message: "Нужен трёхслойный гофрокороб 40x30x25 см",
    idempotencyKey: firstKey,
  });
  assertStatus(firstResponse, 200, "first widget chat");
  if (!firstResponse.headers.get("content-type")?.startsWith("text/event-stream")) {
    throw new Error("widget chat did not return an event stream");
  }
  const firstEvents = parseSse(await firstResponse.text());
  const firstMeta = firstEvents.find((event) => event.event === "meta")?.data;
  const firstAnswer = firstEvents
    .filter((event) => event.event === "delta")
    .map((event) => event.data.text)
    .join("");
  if (
    !firstMeta?.conversationId ||
    !firstAnswer.includes("40x30x25 см") ||
    !firstEvents.some((event) => event.event === "citation") ||
    !firstEvents.some((event) => event.event === "usage") ||
    !firstEvents.some((event) => event.event === "done") ||
    firstEvents.some((event) => event.event === "error") ||
    firstAnswer.includes(syntheticKey)
  ) {
    throw new Error(`first widget stream is incomplete: ${JSON.stringify(firstEvents)}`);
  }

  const restored = await requestJson(
    "/api/v1/widget/session",
    { headers: { origin: widgetOrigin, authorization: `Bearer ${session.sessionToken}` } },
    200,
    "restore widget session",
  );
  if (
    restored.conversation?.id !== firstMeta.conversationId ||
    restored.conversation.messages.length !== 2 ||
    restored.conversation.messages[1]?.content !== firstAnswer
  ) {
    throw new Error(
      `widget session did not restore the persisted conversation: ${JSON.stringify({
        expectedConversationId: firstMeta.conversationId,
        expectedAnswer: firstAnswer,
        restored: restored.conversation,
      })}`,
    );
  }

  const duplicate = await chat({
    token: session.sessionToken,
    conversationId: firstMeta.conversationId,
    message: "Нужен трёхслойный гофрокороб 40x30x25 см",
    idempotencyKey: firstKey,
  });
  assertStatus(duplicate, 409, "duplicate widget message");

  const secondResponse = await chat({
    token: session.sessionToken,
    conversationId: firstMeta.conversationId,
    message: "Количество 120 штук, печать не нужна",
    idempotencyKey: randomUUID(),
  });
  assertStatus(secondResponse, 200, "second widget chat");
  const secondEvents = parseSse(await secondResponse.text());
  if (
    secondEvents.find((event) => event.event === "meta")?.data.conversationId !==
      firstMeta.conversationId ||
    !secondEvents.some((event) => event.event === "done")
  ) {
    throw new Error("second widget turn did not continue the conversation");
  }

  const qualificationRows = await database.client`
    select qualification_state
    from widget_conversations
    where public_id = ${firstMeta.conversationId}
    limit 1
  `;
  const qualification = qualificationRows[0]?.qualification_state;
  if (
    qualification?.dimensions?.lengthMm !== 400 ||
    qualification?.dimensions?.widthMm !== 300 ||
    qualification?.dimensions?.heightMm !== 250 ||
    qualification?.quantity !== 120 ||
    qualification?.material !== "трёхслойный гофрокартон" ||
    qualification?.printingRequired !== false
  ) {
    throw new Error(`qualification state was not preserved: ${JSON.stringify(qualification)}`);
  }

  const foreignSession = await createPublicSession();
  const foreignConversation = await chat({
    token: foreignSession.sessionToken,
    conversationId: firstMeta.conversationId,
    message: "Чужой диалог",
    idempotencyKey: randomUUID(),
  });
  assertStatus(foreignConversation, 404, "foreign widget conversation");

  const wrongOriginResponse = await fetch(`${baseUrl}/api/v1/widget/session`, {
    headers: { origin: wrongOrigin, authorization: `Bearer ${session.sessionToken}` },
  });
  assertStatus(wrongOriginResponse, 401, "widget session from wrong Origin");

  const newConversation = await requestJson(
    "/api/v1/widget/conversations",
    {
      method: "POST",
      headers: {
        ...widgetHeaders,
        authorization: `Bearer ${session.sessionToken}`,
      },
      body: "{}",
    },
    200,
    "new widget conversation",
  );
  if (newConversation.id === firstMeta.conversationId || newConversation.messages.length !== 0) {
    throw new Error("new widget conversation did not reset the active chat");
  }
  const activeRows = await database.client`
    select count(*)::int as count
    from widget_conversations wc
    join widget_sessions ws on ws.id = wc.widget_session_id
    where ws.token_hash is not null
      and wc.widget_session_id = (
        select widget_session_id from widget_conversations where public_id = ${newConversation.id}
      )
      and wc.status = 'active'
  `;
  if (activeRows[0]?.count !== 1)
    throw new Error("a session has more than one active conversation");
} finally {
  await fetch(`${baseUrl}/api/v1/auth/logout`, { method: "POST", headers: mutationHeaders });
  if (projectCreated) {
    await database.client`delete from widget_sessions where project_id = ${projectId}`;
    await database.client`
      update assistants set active_publication_id = null where project_id = ${projectId}
    `;
    await database.client`
      delete from assistant_publications
      where assistant_id in (select id from assistants where project_id = ${projectId})
    `;
    await database.client`delete from audit_events where project_id = ${projectId}`;
    await database.client`delete from projects where id = ${projectId}`;
  }
  await database.client`
    delete from provider_model_catalog
    where provider = 'aitunnel' and model_id = ${modelId} and capability = 'chat'
  `;
  await database.client.end({ timeout: 5 });
}

console.log(
  "Widget chat smoke passed: CORS, opaque session, SSE, RAG, persistence, qualification, idempotency, isolation and new chat",
);
