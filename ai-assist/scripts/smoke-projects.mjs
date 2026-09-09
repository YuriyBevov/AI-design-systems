import { randomUUID } from "node:crypto";

import { createDatabase } from "../packages/database/dist/src/index.js";

const baseUrl = process.env.AI_ASSIST_SMOKE_BASE_URL ?? "http://localhost:3000";
const password = process.env.AI_ASSIST_DEV_OWNER_PASSWORD ?? "LocalDev-ChangeMe-2026!";
const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://ai_assist:change-me-local-only@localhost:55432/ai_assist";
const database = createDatabase(databaseUrl);
const originHeaders = { origin: baseUrl, "sec-fetch-site": "same-origin" };

const assertStatus = async (response, expected, label) => {
  if (response.status === expected) return;
  const body = await response.text();
  throw new Error(`${label}: expected ${expected}, received ${response.status}: ${body}`);
};

const requestJson = async (path, init, expected, label) => {
  const response = await fetch(`${baseUrl}${path}`, init);
  await assertStatus(response, expected, label);
  return response.json();
};

const uniqueSuffix = `${Date.now()}-${randomUUID().slice(0, 8)}`;
const sourceProjectName = `Project lifecycle smoke source ${uniqueSuffix}`;
const foreignProjectId = randomUUID();
let cookieHeader = "";
let mutationHeaders = {};
let sourceProjectId = null;
let sameNameProjectId = null;
let targetProjectId = null;
let foreignProjectCreated = false;

const assistantDraftBody = (settings, overrides = {}) => ({
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
  allowedOrigins: settings.draft.allowedOrigins.map(({ origin, environment }) => ({
    origin,
    environment,
  })),
  ...overrides,
});

try {
  const login = await fetch(`${baseUrl}/api/v1/auth/login`, {
    method: "POST",
    headers: { ...originHeaders, "content-type": "application/json" },
    body: JSON.stringify({ email: "owner@gofroprodpak.local", password }),
  });
  await assertStatus(login, 200, "login");
  const loginBody = await login.json();
  if (!loginBody.user?.id || !loginBody.csrfToken) throw new Error("login response is incomplete");
  cookieHeader = login.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";", 1)[0])
    .join("; ");
  const authenticatedHeaders = { cookie: cookieHeader };
  mutationHeaders = {
    ...originHeaders,
    ...authenticatedHeaders,
    "content-type": "application/json",
    "x-csrf-token": loginBody.csrfToken,
  };

  const sourceProject = await requestJson(
    "/api/v1/projects",
    {
      method: "POST",
      headers: mutationHeaders,
      body: JSON.stringify({
        name: sourceProjectName,
        timezone: "Europe/Moscow",
        templateProjectId: null,
      }),
    },
    200,
    "create source project",
  );
  sourceProjectId = sourceProject.id;
  if (!sourceProject.slug || sourceProject.defaultLocale !== "ru") {
    throw new Error("server-generated project defaults are incorrect");
  }

  const sourceWithRetention = await requestJson(
    `/api/v1/projects/${sourceProjectId}`,
    {
      method: "PATCH",
      headers: mutationHeaders,
      body: JSON.stringify({ conversationRetentionDays: 45 }),
    },
    200,
    "configure source assistant retention",
  );
  if (sourceWithRetention.conversationRetentionDays !== 45) {
    throw new Error("assistant retention was not saved");
  }

  const sameNameProject = await requestJson(
    "/api/v1/projects",
    {
      method: "POST",
      headers: mutationHeaders,
      body: JSON.stringify({ name: sourceProjectName }),
    },
    200,
    "create project with the same name",
  );
  sameNameProjectId = sameNameProject.id;
  if (sameNameProject.slug === sourceProject.slug) {
    throw new Error("automatic project identifiers must stay unique");
  }

  await database.client`
    insert into projects (id, name, slug, status)
    values (${foreignProjectId}, 'Foreign project template', ${`foreign-${uniqueSuffix}`}, 'active')
  `;
  foreignProjectCreated = true;
  const foreignTemplate = await fetch(`${baseUrl}/api/v1/projects`, {
    method: "POST",
    headers: mutationHeaders,
    body: JSON.stringify({ name: "Foreign copy", templateProjectId: foreignProjectId }),
  });
  await assertStatus(foreignTemplate, 404, "foreign project template");

  const initialAssistant = await requestJson(
    `/api/v1/projects/${sourceProjectId}/assistant`,
    { headers: authenticatedHeaders },
    200,
    "source assistant defaults",
  );
  const sourceAssistant = await requestJson(
    `/api/v1/projects/${sourceProjectId}/assistant/draft`,
    {
      method: "PATCH",
      headers: mutationHeaders,
      body: JSON.stringify(
        assistantDraftBody(initialAssistant, {
          name: "Reusable sales assistant",
          greeting: "Copied assistant greeting",
          contactFallback: "source-owner@example.test",
          allowedOrigins: [{ origin: "https://source-project.example", environment: "production" }],
        }),
      ),
    },
    200,
    "configure source assistant",
  );

  const sourcePrompt = await requestJson(
    `/api/v1/projects/${sourceProjectId}/prompts`,
    {
      method: "POST",
      headers: mutationHeaders,
      body: JSON.stringify({
        name: "Reusable system prompt",
        description: "Template prompt",
        content: "First prompt revision for {{project.name}}.",
      }),
    },
    200,
    "create source prompt",
  );
  const sourcePromptLatest = await requestJson(
    `/api/v1/projects/${sourceProjectId}/prompts/${sourcePrompt.prompt.id}/revisions`,
    {
      method: "POST",
      headers: mutationHeaders,
      body: JSON.stringify({
        expectedVersion: sourcePrompt.prompt.version,
        content: "Latest prompt revision for {{project.name}}.",
      }),
    },
    200,
    "create latest source prompt revision",
  );

  await requestJson(
    `/api/v1/projects/${sourceProjectId}/knowledge/documents`,
    {
      method: "POST",
      headers: mutationHeaders,
      body: JSON.stringify({
        type: "manual",
        title: "Source-only knowledge",
        content: "This content must not be copied into a new project.",
        canonicalUrl: null,
        locale: "ru",
        tags: ["smoke"],
        product: null,
      }),
    },
    200,
    "create source knowledge",
  );

  await database.client`
    insert into provider_credentials (
      project_id, ciphertext, nonce, auth_tag, key_version, masked_hint, status, last_verified_at
    ) values (
      ${sourceProjectId}, 'source-only-ciphertext', 'source-only-nonce', 'source-only-auth-tag',
      1, 'sk-aitunnel-…source', 'verified', now()
    )
  `;
  await database.client`
    insert into project_model_settings (
      project_id, chat_model_id, embedding_model_id, max_output_tokens, temperature, updated_by
    ) values (
      ${sourceProjectId}, 'source-only-chat-model', 'source-only-embedding-model', 2048, 0.2,
      ${loginBody.user.id}
    )
  `;

  const sourceProvider = await requestJson(
    `/api/v1/projects/${sourceProjectId}/provider`,
    { headers: authenticatedHeaders },
    200,
    "source provider",
  );
  const sourceKnowledge = await requestJson(
    `/api/v1/projects/${sourceProjectId}/knowledge/documents`,
    { headers: authenticatedHeaders },
    200,
    "source knowledge",
  );
  if (!sourceProvider.credential || sourceKnowledge.documents.length !== 1) {
    throw new Error("source project fixtures are incomplete");
  }

  const targetProject = await requestJson(
    "/api/v1/projects",
    {
      method: "POST",
      headers: mutationHeaders,
      body: JSON.stringify({
        name: "Project lifecycle smoke copy",
        timezone: "Asia/Yekaterinburg",
        templateProjectId: sourceProjectId,
      }),
    },
    200,
    "copy project from template",
  );
  targetProjectId = targetProject.id;
  if (
    targetProject.status !== "active" ||
    targetProject.primaryOrigin !== null ||
    targetProject.timezone !== "Asia/Yekaterinburg" ||
    targetProject.defaultLocale !== "ru" ||
    targetProject.conversationRetentionDays !== 45
  ) {
    throw new Error("target project-specific settings are incorrect");
  }

  const [
    targetAssistant,
    targetPrompts,
    targetProvider,
    targetModels,
    targetKnowledge,
    targetAudit,
  ] = await Promise.all([
    requestJson(
      `/api/v1/projects/${targetProjectId}/assistant`,
      { headers: authenticatedHeaders },
      200,
      "target assistant",
    ),
    requestJson(
      `/api/v1/projects/${targetProjectId}/prompts`,
      { headers: authenticatedHeaders },
      200,
      "target prompts",
    ),
    requestJson(
      `/api/v1/projects/${targetProjectId}/provider`,
      { headers: authenticatedHeaders },
      200,
      "target provider",
    ),
    requestJson(
      `/api/v1/projects/${targetProjectId}/model-settings`,
      { headers: authenticatedHeaders },
      200,
      "target model settings",
    ),
    requestJson(
      `/api/v1/projects/${targetProjectId}/knowledge/documents`,
      { headers: authenticatedHeaders },
      200,
      "target knowledge",
    ),
    requestJson(
      `/api/v1/projects/${targetProjectId}/audit`,
      { headers: authenticatedHeaders },
      200,
      "target audit",
    ),
  ]);

  if (
    targetAssistant.draft.name !== sourceAssistant.draft.name ||
    targetAssistant.draft.greeting !== sourceAssistant.draft.greeting ||
    targetAssistant.draft.locale !== "ru" ||
    targetAssistant.draft.contactFallback !== null ||
    targetAssistant.draft.allowedOrigins.length !== 0 ||
    targetAssistant.assistant.publicId === sourceAssistant.assistant.publicId
  ) {
    throw new Error("assistant template allowlist is incorrect");
  }
  if (targetPrompts.prompts.length !== 1 || targetPrompts.prompts[0].status !== "draft") {
    throw new Error("target prompts were not copied as fresh drafts");
  }
  const targetPrompt = await requestJson(
    `/api/v1/projects/${targetProjectId}/prompts/${targetPrompts.prompts[0].id}`,
    { headers: authenticatedHeaders },
    200,
    "target prompt details",
  );
  if (
    targetPrompt.revisions.length !== 1 ||
    targetPrompt.revisions[0].content !== sourcePromptLatest.revisions[0].content ||
    targetPrompt.activePublication !== null
  ) {
    throw new Error("only the latest prompt revision should be copied without publication");
  }
  if (
    targetProvider.credential !== null ||
    targetModels.chatModelId !== null ||
    targetModels.embeddingModelId !== null ||
    targetKnowledge.documents.length !== 0
  ) {
    throw new Error("project-specific provider, models or knowledge leaked into target project");
  }
  if (
    targetAudit.length !== 1 ||
    targetAudit[0].action !== "project.created" ||
    targetAudit[0].metadata.templateProjectId !== sourceProjectId ||
    !targetAudit[0].metadata.excluded?.includes("providerCredentials")
  ) {
    throw new Error("target project audit does not describe the safe copy policy");
  }

  const suspended = await requestJson(
    `/api/v1/projects/${targetProjectId}/status`,
    {
      method: "PATCH",
      headers: mutationHeaders,
      body: JSON.stringify({ status: "suspended" }),
    },
    200,
    "suspend target project",
  );
  if (suspended.status !== "suspended") throw new Error("project was not suspended");
  const suspendedScope = await fetch(`${baseUrl}/api/v1/projects/${targetProjectId}/assistant`, {
    headers: authenticatedHeaders,
  });
  await assertStatus(suspendedScope, 404, "suspended project runtime scope");
  const manageableProjects = await requestJson(
    "/api/v1/projects",
    { headers: authenticatedHeaders },
    200,
    "manageable projects with suspended target",
  );
  if (
    !manageableProjects.some(
      (project) => project.id === targetProjectId && project.status === "suspended",
    )
  ) {
    throw new Error("suspended project is missing from management list");
  }

  const resumed = await requestJson(
    `/api/v1/projects/${targetProjectId}/status`,
    {
      method: "PATCH",
      headers: mutationHeaders,
      body: JSON.stringify({ status: "active" }),
    },
    200,
    "resume target project",
  );
  if (resumed.status !== "active") throw new Error("project was not resumed");
  await requestJson(
    `/api/v1/projects/${targetProjectId}/assistant`,
    { headers: authenticatedHeaders },
    200,
    "resumed project scope",
  );

  const archived = await requestJson(
    `/api/v1/projects/${targetProjectId}`,
    { method: "DELETE", headers: mutationHeaders },
    200,
    "archive target project",
  );
  if (archived.status !== "archived") throw new Error("project was not soft-deleted");
  const listAfterArchive = await requestJson(
    "/api/v1/projects",
    { headers: authenticatedHeaders },
    200,
    "project list after archive",
  );
  if (listAfterArchive.some((project) => project.id === targetProjectId)) {
    throw new Error("archived project is still present in management list");
  }
  const archivedRow = await database.client`
    select status from projects where id = ${targetProjectId} limit 1
  `;
  if (archivedRow[0]?.status !== "archived") {
    throw new Error("soft-deleted project data was not preserved");
  }
  const archivedResume = await fetch(`${baseUrl}/api/v1/projects/${targetProjectId}/status`, {
    method: "PATCH",
    headers: mutationHeaders,
    body: JSON.stringify({ status: "active" }),
  });
  await assertStatus(archivedResume, 404, "archived project cannot be resumed");
} finally {
  if (cookieHeader) {
    await fetch(`${baseUrl}/api/v1/auth/logout`, { method: "POST", headers: mutationHeaders });
  }
  const cleanupProjectIds = [sourceProjectId, sameNameProjectId, targetProjectId].filter(Boolean);
  if (cleanupProjectIds.length > 0) {
    await database.client`
      delete from knowledge_documents where project_id = any(${cleanupProjectIds}::uuid[])
    `;
    await database.client`
      delete from knowledge_sources where project_id = any(${cleanupProjectIds}::uuid[])
    `;
    await database.client`
      delete from audit_events where project_id = any(${cleanupProjectIds}::uuid[])
    `;
    await database.client`delete from projects where id = any(${cleanupProjectIds}::uuid[])`;
  }
  if (foreignProjectCreated) {
    await database.client`delete from projects where id = ${foreignProjectId}`;
  }
  await database.client.end({ timeout: 5 });
}

console.log(
  "Projects smoke passed: generated identifiers, safe template copy, isolation, suspend/resume and soft-delete",
);
