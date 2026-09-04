import { randomUUID } from "node:crypto";

import { createDatabase } from "../packages/database/dist/src/index.js";

const baseUrl = process.env.AI_ASSIST_SMOKE_BASE_URL ?? "http://localhost:3100";
const password = process.env.AI_ASSIST_DEV_OWNER_PASSWORD ?? "LocalDev-ChangeMe-2026!";
const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://ai_assist:change-me-local-only@localhost:55432/ai_assist";
const expectedRateLimit = Number(process.env.AI_ASSIST_PREVIEW_SMOKE_RATE_LIMIT_MAX ?? 0);
const syntheticKey = "sk-aitunnel-smoke-fake-key-0000";
const projectId = randomUUID();
const projectSlug = `prompt-preview-smoke-${projectId}`;
const modelId = `mock-preview-${projectId}`;
const question = "Как быстро доставляют гофрокороба?";
const expectedAnswer = `Mock preview: ${question}`;
const originHeaders = { origin: baseUrl, "sec-fetch-site": "same-origin" };
const database = createDatabase(databaseUrl);
let projectCreated = false;
let successfulPreviewRequests = 0;

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
      'Prompt preview smoke',
      ${projectSlug},
      'https://prompt-preview-smoke.example',
      'Europe/Moscow',
      'ru'
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
      ${"0".repeat(64)}
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
    "save synthetic preview credential",
  );
  await requestJson(
    `/api/v1/projects/${projectId}/model-settings`,
    {
      method: "PUT",
      headers: mutationHeaders,
      body: JSON.stringify({ chatModelId: modelId, maxOutputTokens: 64, temperature: 0.2 }),
    },
    200,
    "select mock preview model",
  );
  const prompt = await requestJson(
    `/api/v1/projects/${projectId}/prompts`,
    {
      method: "POST",
      headers: mutationHeaders,
      body: JSON.stringify({
        name: "Preview smoke prompt",
        content:
          "Ты — {{assistant.name}} проекта {{project.name}}. Сегодня {{runtime.current_date}}.",
      }),
    },
    200,
    "create preview prompt",
  );
  const revisionId = prompt.revisions[0]?.id;
  if (!revisionId) throw new Error("preview prompt revision is missing");

  const knowledge = await requestJson(
    `/api/v1/projects/${projectId}/knowledge/documents`,
    {
      method: "POST",
      headers: mutationHeaders,
      body: JSON.stringify({
        type: "manual",
        title: "Доставка гофрокоробов",
        content: "Гофрокороба доставляют по Москве за один рабочий день.",
        canonicalUrl: "https://prompt-preview-smoke.example/delivery",
        locale: "ru",
        tags: ["доставка", "гофрокороба"],
        product: null,
      }),
    },
    200,
    "create preview knowledge",
  );
  const knowledgeDocumentId = knowledge.document.id;
  const knowledgeVersionId = knowledge.versions[0]?.id;
  if (!knowledgeDocumentId || !knowledgeVersionId) {
    throw new Error("preview knowledge response is incomplete");
  }
  const publishedKnowledge = await requestJson(
    `/api/v1/projects/${projectId}/knowledge/documents/${knowledgeDocumentId}/publish`,
    {
      method: "POST",
      headers: mutationHeaders,
      body: JSON.stringify({ expectedVersion: 1, versionId: knowledgeVersionId }),
    },
    200,
    "publish preview knowledge",
  );
  if (publishedKnowledge.document.status !== "published") {
    throw new Error("preview knowledge was not published");
  }

  const withoutCsrf = await fetch(
    `${baseUrl}/api/v1/projects/${projectId}/prompts/${prompt.prompt.id}/preview`,
    {
      method: "POST",
      headers: { ...originHeaders, ...authenticatedHeaders, "content-type": "application/json" },
      body: JSON.stringify({ revisionId, question }),
    },
  );
  assertStatus(withoutCsrf, 403, "preview without CSRF");

  const preview = await requestJson(
    `/api/v1/projects/${projectId}/prompts/${prompt.prompt.id}/preview`,
    {
      method: "POST",
      headers: mutationHeaders,
      body: JSON.stringify({ revisionId, question }),
    },
    200,
    "prompt preview",
  );
  successfulPreviewRequests += 1;
  if (
    preview.answer !== expectedAnswer ||
    preview.promptRevisionId !== revisionId ||
    preview.model.requestedId !== modelId ||
    preview.model.resolvedId !== modelId ||
    preview.usage.inputTokens !== 12 ||
    preview.usage.outputTokens !== 4 ||
    preview.retrieval.status !== "ready" ||
    preview.retrieval.sources[0]?.documentId !== knowledgeDocumentId ||
    !preview.retrieval.sources[0]?.excerpt.includes("один рабочий день")
  ) {
    throw new Error("prompt preview response is incomplete");
  }

  const unpublishedKnowledge = await requestJson(
    `/api/v1/projects/${projectId}/knowledge/documents/${knowledgeDocumentId}/unpublish`,
    {
      method: "POST",
      headers: mutationHeaders,
      body: JSON.stringify({ expectedVersion: publishedKnowledge.document.version }),
    },
    200,
    "unpublish preview knowledge",
  );
  if (unpublishedKnowledge.document.activeVersionId !== null) {
    throw new Error("preview knowledge active pointer was not cleared");
  }

  const previewWithoutKnowledge = await requestJson(
    `/api/v1/projects/${projectId}/prompts/${prompt.prompt.id}/preview`,
    {
      method: "POST",
      headers: mutationHeaders,
      body: JSON.stringify({ revisionId, question }),
    },
    200,
    "prompt preview after unpublish",
  );
  successfulPreviewRequests += 1;
  if (
    previewWithoutKnowledge.answer !== expectedAnswer ||
    previewWithoutKnowledge.retrieval.status !== "empty" ||
    previewWithoutKnowledge.retrieval.sources.length !== 0
  ) {
    throw new Error("unpublished knowledge remained available to prompt preview");
  }

  const assistant = await requestJson(
    `/api/v1/projects/${projectId}/assistant`,
    { headers: authenticatedHeaders },
    200,
    "assistant after preview",
  );
  if (assistant.activeConfig !== null || !assistant.hasUnpublishedChanges) {
    throw new Error("prompt preview changed production state");
  }

  const auditResponse = await fetch(`${baseUrl}/api/v1/projects/${projectId}/audit`, {
    headers: authenticatedHeaders,
  });
  assertStatus(auditResponse, 200, "preview audit");
  const auditText = await auditResponse.text();
  if (!auditText.includes("prompt.previewed")) throw new Error("preview audit event is missing");
  if (
    auditText.includes(question) ||
    auditText.includes(expectedAnswer) ||
    auditText.includes(syntheticKey)
  ) {
    throw new Error("preview audit leaked content or credential material");
  }

  if (expectedRateLimit > 0) {
    if (expectedRateLimit < successfulPreviewRequests) {
      throw new Error("preview smoke rate-limit maximum is below the required successful requests");
    }
    for (let requestNo = successfulPreviewRequests; requestNo < expectedRateLimit; requestNo += 1) {
      await requestJson(
        `/api/v1/projects/${projectId}/prompts/${prompt.prompt.id}/preview`,
        {
          method: "POST",
          headers: mutationHeaders,
          body: JSON.stringify({ revisionId, question: `Rate check ${requestNo}` }),
        },
        200,
        `preview rate-limit request ${requestNo}`,
      );
    }
    const limited = await fetch(
      `${baseUrl}/api/v1/projects/${projectId}/prompts/${prompt.prompt.id}/preview`,
      {
        method: "POST",
        headers: mutationHeaders,
        body: JSON.stringify({ revisionId, question: "Rate limit overflow" }),
      },
    );
    assertStatus(limited, 429, "prompt preview rate limit");
    if (!(await limited.text()).includes("PROMPT_PREVIEW_RATE_LIMITED")) {
      throw new Error("prompt preview rate limit did not return its policy code");
    }
  }
} finally {
  await fetch(`${baseUrl}/api/v1/auth/logout`, { method: "POST", headers: mutationHeaders });
  if (projectCreated) {
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
  "Prompt preview smoke passed: CSRF, published retrieval, immediate unpublish, mock stream, diagnostics, audit, rate limit and production isolation",
);
