import { randomUUID } from "node:crypto";

import { createDatabase } from "../packages/database/dist/src/index.js";

const baseUrl = process.env.AI_ASSIST_SMOKE_BASE_URL ?? "http://localhost:3000";
const password = process.env.AI_ASSIST_DEV_OWNER_PASSWORD ?? "LocalDev-ChangeMe-2026!";
const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://ai_assist:change-me-local-only@localhost:55432/ai_assist";
const originHeaders = { origin: baseUrl, "sec-fetch-site": "same-origin" };
const database = createDatabase(databaseUrl);

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
const sourceProjectId = loginBody.projects?.[0]?.id;
if (!sourceProjectId || !loginBody.csrfToken) throw new Error("login response is incomplete");
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

const projectId = randomUUID();
const projectSlug = `assistant-smoke-${projectId}`;
let projectCreated = false;

const draftBody = (settings, overrides = {}) => ({
  expectedVersion: settings.assistant.configVersion,
  name: settings.draft.name,
  greeting: settings.draft.greeting,
  placeholder: settings.draft.placeholder,
  accentColor: settings.draft.accentColor,
  launcherPosition: settings.draft.launcherPosition,
  contactFallback: settings.draft.contactFallback,
  locale: settings.draft.locale,
  enabled: settings.draft.enabled,
  maintenanceMessage: settings.draft.maintenanceMessage,
  maxConversationTurns: settings.draft.maxConversationTurns,
  responseTimeoutSeconds: settings.draft.responseTimeoutSeconds,
  dailyRateLimit: settings.draft.dailyRateLimit,
  citationsEnabled: settings.draft.citationsEnabled,
  allowedOrigins: settings.draft.allowedOrigins.map(({ origin }) => ({ origin })),
  ...overrides,
});

try {
  const modelSettings = await database.client`
    select chat_model_id, embedding_model_id, rerank_model_id, max_output_tokens, temperature
    from project_model_settings
    where project_id = ${sourceProjectId}
    limit 1
  `;
  if (!modelSettings[0]?.chat_model_id) {
    throw new Error("source project must have a selected chat model");
  }
  await database.client`
    insert into projects (id, name, slug, primary_origin)
    values (${projectId}, 'Assistant smoke tenant', ${projectSlug}, 'https://assistant-smoke.example')
  `;
  projectCreated = true;
  await database.client`
    insert into project_memberships (project_id, user_id, role)
    values (${projectId}, ${loginBody.user.id}, 'owner')
  `;
  await database.client`
    insert into project_model_settings (
      project_id,
      chat_model_id,
      embedding_model_id,
      rerank_model_id,
      max_output_tokens,
      temperature,
      updated_by
    ) values (
      ${projectId},
      ${modelSettings[0].chat_model_id},
      ${modelSettings[0].embedding_model_id},
      ${modelSettings[0].rerank_model_id},
      ${modelSettings[0].max_output_tokens},
      ${modelSettings[0].temperature},
      ${loginBody.user.id}
    )
  `;

  const initial = await requestJson(
    `/api/v1/projects/${projectId}/assistant`,
    { headers: authenticatedHeaders },
    200,
    "initial assistant settings",
  );
  if (
    initial.assistant.configVersion !== 1 ||
    initial.draft.revisionNo !== 1 ||
    initial.draft.allowedOrigins[0]?.origin !== "https://assistant-smoke.example"
  ) {
    throw new Error("assistant defaults were not initialized correctly");
  }

  const foreign = await fetch(
    `${baseUrl}/api/v1/projects/00000000-0000-4000-8000-000000000001/assistant`,
    { headers: authenticatedHeaders },
  );
  assertStatus(foreign, 404, "foreign assistant project");

  const invalidOrigin = await fetch(`${baseUrl}/api/v1/projects/${projectId}/assistant/draft`, {
    method: "PATCH",
    headers: mutationHeaders,
    body: JSON.stringify(
      draftBody(initial, {
        allowedOrigins: [{ origin: "https://assistant-smoke.example/catalog" }],
      }),
    ),
  });
  assertStatus(invalidOrigin, 422, "invalid Origin");
  if (!(await invalidOrigin.text()).includes("ASSISTANT_ORIGIN_INVALID")) {
    throw new Error("invalid Origin did not return its policy code");
  }

  const draftTwo = await requestJson(
    `/api/v1/projects/${projectId}/assistant/draft`,
    {
      method: "PATCH",
      headers: mutationHeaders,
      body: JSON.stringify(
        draftBody(initial, {
          name: "Smoke assistant",
          greeting: "Draft greeting two",
          allowedOrigins: [
            { origin: "https://assistant-smoke.example/" },
            { origin: "http://localhost:4173" },
          ],
        }),
      ),
    },
    200,
    "create config revision two",
  );
  if (
    draftTwo.assistant.configVersion !== 2 ||
    draftTwo.draft.revisionNo !== 2 ||
    !draftTwo.hasUnpublishedChanges
  ) {
    throw new Error("assistant config revision two is incorrect");
  }

  const staleUpdate = await fetch(`${baseUrl}/api/v1/projects/${projectId}/assistant/draft`, {
    method: "PATCH",
    headers: mutationHeaders,
    body: JSON.stringify(draftBody(initial, { greeting: "Stale greeting" })),
  });
  assertStatus(staleUpdate, 409, "stale assistant settings update");
  if (!(await staleUpdate.text()).includes("ASSISTANT_VERSION_CONFLICT")) {
    throw new Error("stale assistant update did not return its policy code");
  }

  const unchanged = await fetch(`${baseUrl}/api/v1/projects/${projectId}/assistant/draft`, {
    method: "PATCH",
    headers: mutationHeaders,
    body: JSON.stringify(draftBody(draftTwo)),
  });
  assertStatus(unchanged, 409, "unchanged assistant settings");
  if (!(await unchanged.text()).includes("ASSISTANT_CONFIG_UNCHANGED")) {
    throw new Error("unchanged assistant config did not return its policy code");
  }

  const prompt = await requestJson(
    `/api/v1/projects/${projectId}/prompts`,
    {
      method: "POST",
      headers: mutationHeaders,
      body: JSON.stringify({
        name: "Assistant smoke prompt",
        content: "Ты консультант {{project.name}}.",
      }),
    },
    200,
    "create assistant smoke prompt",
  );
  const publishedPrompt = await requestJson(
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
    "publish prompt with config revision two",
  );
  if (publishedPrompt.activePublication?.assistantConfig.greeting !== "Draft greeting two") {
    throw new Error("prompt publication did not snapshot config revision two");
  }

  const draftThree = await requestJson(
    `/api/v1/projects/${projectId}/assistant/draft`,
    {
      method: "PATCH",
      headers: mutationHeaders,
      body: JSON.stringify(draftBody(draftTwo, { greeting: "Draft greeting three" })),
    },
    200,
    "create config revision three",
  );
  if (draftThree.activeConfig?.revisionNo !== 2 || !draftThree.hasUnpublishedChanges) {
    throw new Error("draft config changed production before publication");
  }

  const runtimeBefore = await requestJson(
    `/api/v1/projects/${projectId}/prompt-publication`,
    { headers: authenticatedHeaders },
    200,
    "runtime before assistant publication",
  );
  if (runtimeBefore.assistantConfig.greeting !== "Draft greeting two") {
    throw new Error("runtime resolved an unpublished assistant config");
  }

  const publishedAssistant = await requestJson(
    `/api/v1/projects/${projectId}/assistant/publish`,
    {
      method: "POST",
      headers: mutationHeaders,
      body: JSON.stringify({ expectedVersion: draftThree.assistant.configVersion }),
    },
    200,
    "publish assistant config revision three",
  );
  if (
    publishedAssistant.activeConfig?.revisionNo !== 3 ||
    publishedAssistant.hasUnpublishedChanges
  ) {
    throw new Error("assistant config revision three was not activated");
  }

  const runtimeAfter = await requestJson(
    `/api/v1/projects/${projectId}/prompt-publication`,
    { headers: authenticatedHeaders },
    200,
    "runtime after assistant publication",
  );
  if (
    runtimeAfter.assistantConfig.greeting !== "Draft greeting three" ||
    runtimeAfter.promptRevisionId !== runtimeBefore.promptRevisionId ||
    runtimeAfter.configRevisionId === runtimeBefore.configRevisionId ||
    JSON.stringify(runtimeAfter.modelSettings) !== JSON.stringify(runtimeBefore.modelSettings)
  ) {
    throw new Error(
      `runtime switch mismatch: ${JSON.stringify({
        beforeConfigRevisionId: runtimeBefore.configRevisionId,
        afterConfigRevisionId: runtimeAfter.configRevisionId,
        samePromptRevision: runtimeAfter.promptRevisionId === runtimeBefore.promptRevisionId,
        sameModelSettings:
          JSON.stringify(runtimeAfter.modelSettings) ===
          JSON.stringify(runtimeBefore.modelSettings),
        afterGreeting: runtimeAfter.assistantConfig.greeting,
      })}`,
    );
  }

  const repeatedPublication = await fetch(
    `${baseUrl}/api/v1/projects/${projectId}/assistant/publish`,
    {
      method: "POST",
      headers: mutationHeaders,
      body: JSON.stringify({ expectedVersion: draftThree.assistant.configVersion }),
    },
  );
  assertStatus(repeatedPublication, 409, "repeated assistant publication");
  if (!(await repeatedPublication.text()).includes("ASSISTANT_CONFIG_UNCHANGED")) {
    throw new Error("repeated assistant publication did not return its policy code");
  }

  const audit = await requestJson(
    `/api/v1/projects/${projectId}/audit`,
    { headers: authenticatedHeaders },
    200,
    "assistant audit",
  );
  for (const action of ["assistant.config_revision_created", "assistant.published"]) {
    if (!audit.some((event) => event.action === action)) {
      throw new Error(`assistant audit action is missing: ${action}`);
    }
  }
} finally {
  await fetch(`${baseUrl}/api/v1/auth/logout`, { method: "POST", headers: mutationHeaders });
  if (projectCreated) {
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
  await database.client.end({ timeout: 5 });
}

console.log(
  "Assistant smoke passed: defaults, revisions, Origins, conflicts and publication isolation",
);
