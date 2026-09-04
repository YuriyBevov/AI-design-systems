import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

import { createDatabase } from "../packages/database/dist/src/index.js";

const baseUrl = process.env.AI_ASSIST_SMOKE_BASE_URL ?? "http://localhost:3100";
const password = process.env.AI_ASSIST_DEV_OWNER_PASSWORD ?? "LocalDev-ChangeMe-2026!";
const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://ai_assist:change-me-local-only@localhost:55432/ai_assist";
const syntheticKey = "sk-aitunnel-smoke-fake-key-0000";
const database = createDatabase(databaseUrl);
const projectId = randomUUID();
const projectSlug = `knowledge-index-smoke-${projectId}`;
const embeddingModelId = `mock-embedding-${projectId}`;
const chatModelId = `mock-chat-${projectId}`;
const originHeaders = { origin: baseUrl, "sec-fetch-site": "same-origin" };
let projectCreated = false;

const assertStatus = (response, expected, label) => {
  if (response.status !== expected) {
    throw new Error(`${label}: expected ${expected}, received ${response.status}`);
  }
};

const requestJson = async (path, init, expected, label) => {
  const response = await fetch(`${baseUrl}${path}`, init);
  assertStatus(response, expected, label);
  return response.json();
};

const login = await fetch(`${baseUrl}/api/v1/auth/login`, {
  method: "POST",
  headers: { ...originHeaders, "content-type": "application/json" },
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
  ...originHeaders,
  ...authenticatedHeaders,
  "content-type": "application/json",
  "x-csrf-token": loginBody.csrfToken,
};

try {
  await database.client`
    insert into projects (id, name, slug, primary_origin, timezone, default_locale)
    values (
      ${projectId},
      'Knowledge index smoke',
      ${projectSlug},
      'https://knowledge-index-smoke.example',
      'Europe/Moscow',
      'ru'
    )
  `;
  await database.client`
    insert into provider_model_catalog (
      provider, model_id, capability, upstream_provider, input_modalities, output_modalities,
      max_output, max_tokens, pricing, available, fetched_at, raw_checksum
    ) values (
      'aitunnel', ${chatModelId}, 'chat', 'mock', '["text"]'::jsonb,
      '["text"]'::jsonb, 256, 4096, '{}'::jsonb, true, now(), ${"2".repeat(64)}
    )
  `;
  projectCreated = true;
  await database.client`
    insert into project_memberships (project_id, user_id, role)
    values (${projectId}, ${loginBody.user.id}, 'owner')
  `;
  await database.client`
    insert into provider_model_catalog (
      provider, model_id, capability, upstream_provider, input_modalities, output_modalities,
      pricing, available, fetched_at, raw_checksum
    ) values (
      'aitunnel', ${embeddingModelId}, 'embeddings', 'mock', '["text"]'::jsonb,
      '["embedding"]'::jsonb, '{}'::jsonb, true, now(), ${"1".repeat(64)}
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
    "save synthetic credential",
  );
  await requestJson(
    `/api/v1/projects/${projectId}/model-settings`,
    {
      method: "PUT",
      headers: mutationHeaders,
      body: JSON.stringify({
        embeddingModelId,
        chatModelId,
        maxOutputTokens: 64,
        temperature: 0.2,
      }),
    },
    200,
    "select mock embedding model",
  );
  const knowledge = await requestJson(
    `/api/v1/projects/${projectId}/knowledge/documents`,
    {
      method: "POST",
      headers: mutationHeaders,
      body: JSON.stringify({
        type: "manual",
        title: "Доставка гофрокоробов",
        content: "Гофрокороба доставляются по Москве за один рабочий день.",
        canonicalUrl: "https://knowledge-index-smoke.example/delivery",
        locale: "ru",
        tags: ["доставка", "гофрокороба"],
        product: null,
      }),
    },
    200,
    "create knowledge",
  );
  await requestJson(
    `/api/v1/projects/${projectId}/knowledge/documents/${knowledge.document.id}/publish`,
    {
      method: "POST",
      headers: mutationHeaders,
      body: JSON.stringify({ expectedVersion: 1, versionId: knowledge.versions[0].id }),
    },
    200,
    "publish knowledge",
  );

  const before = await requestJson(
    `/api/v1/projects/${projectId}/knowledge`,
    { headers: authenticatedHeaders },
    200,
    "read empty index state",
  );
  if (before.active !== null || !before.stale || before.publishedChunkCount < 1) {
    throw new Error("initial index state is invalid");
  }
  const withoutCsrf = await fetch(`${baseUrl}/api/v1/projects/${projectId}/knowledge/reindex`, {
    method: "POST",
    headers: { ...originHeaders, ...authenticatedHeaders },
  });
  assertStatus(withoutCsrf, 403, "reindex without CSRF");

  const requested = await requestJson(
    `/api/v1/projects/${projectId}/knowledge/reindex`,
    { method: "POST", headers: mutationHeaders },
    200,
    "request reindex",
  );
  if (requested.index.status !== "queued" || !requested.jobId) {
    throw new Error("index job was not queued");
  }

  let state;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    await delay(200);
    state = await requestJson(
      `/api/v1/projects/${projectId}/knowledge`,
      { headers: authenticatedHeaders },
      200,
      "poll index state",
    );
    if (state.latest?.status === "active" || state.latest?.status === "failed") break;
  }
  if (state?.latest?.status !== "active") {
    throw new Error(`index did not activate: ${state?.latest?.errorCode ?? "timeout"}`);
  }
  if (state.stale || state.active.embeddingDimension !== 3) {
    throw new Error("active index metadata is invalid");
  }
  const rows = await database.client`
    select count(*)::int as count
    from knowledge_index_embeddings
    where index_version_id = ${state.active.id}
  `;
  if (Number(rows[0]?.count ?? 0) !== state.active.chunkCount) {
    throw new Error("embedding rows do not match the active chunk count");
  }

  const prompt = await requestJson(
    `/api/v1/projects/${projectId}/prompts`,
    {
      method: "POST",
      headers: mutationHeaders,
      body: JSON.stringify({
        name: "Hybrid retrieval smoke",
        content: "Отвечай только по подтверждённым источникам проекта {{project.name}}.",
      }),
    },
    200,
    "create prompt",
  );
  const preview = await requestJson(
    `/api/v1/projects/${projectId}/prompts/${prompt.prompt.id}/preview`,
    {
      method: "POST",
      headers: mutationHeaders,
      body: JSON.stringify({
        revisionId: prompt.revisions[0].id,
        question: "Как быстро доставляют гофрокороба?",
      }),
    },
    200,
    "preview with hybrid retrieval",
  );
  if (
    preview.retrieval.mode !== "hybrid" ||
    preview.retrieval.indexVersionId !== state.active.id ||
    preview.retrieval.sources.length < 1
  ) {
    throw new Error("prompt preview did not use the active hybrid index");
  }

  console.log("Knowledge vector index smoke passed");
} finally {
  if (projectCreated) await database.client`delete from projects where id = ${projectId}`;
  await database.client`
    delete from provider_model_catalog
    where provider = 'aitunnel' and model_id in (${embeddingModelId}, ${chatModelId})
  `;
  await database.client.end({ timeout: 5 });
}
