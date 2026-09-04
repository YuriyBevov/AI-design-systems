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

const requestJson = async (path, init, expected, label) => {
  const response = await fetch(`${baseUrl}${path}`, init);
  assertStatus(response, expected, label);
  return response.json();
};

const projectId = randomUUID();
const projectSlug = `prompt-smoke-${projectId}`;
let promptId;
let projectCreated = false;
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
    values (${projectId}, 'Prompt smoke tenant', ${projectSlug}, 'https://prompt-smoke.example')
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
    `/api/v1/projects/${projectId}/prompts`,
    { headers: authenticatedHeaders },
    200,
    "initial prompt list",
  );
  if (initial.prompts.length || initial.activePublication) {
    throw new Error("prompt smoke only runs on a project without prompts/publications");
  }

  const created = await requestJson(
    `/api/v1/projects/${projectId}/prompts`,
    {
      method: "POST",
      headers: mutationHeaders,
      body: JSON.stringify({
        name: "Smoke system prompt",
        description: "Synthetic integration fixture",
        content: "Ты консультант проекта {{project.name}}. Не выдумывай факты.",
      }),
    },
    200,
    "create prompt",
  );
  promptId = created.prompt.id;
  if (created.prompt.version !== 1 || created.revisions[0]?.revisionNo !== 1) {
    throw new Error("initial prompt revision/version is incorrect");
  }

  const crossProjectRead = await fetch(
    `${baseUrl}/api/v1/projects/${sourceProjectId}/prompts/${promptId}`,
    { headers: authenticatedHeaders },
  );
  assertStatus(crossProjectRead, 404, "cross-project prompt id");

  const patched = await requestJson(
    `/api/v1/projects/${projectId}/prompts/${promptId}`,
    {
      method: "PATCH",
      headers: mutationHeaders,
      body: JSON.stringify({ expectedVersion: 1, name: "Smoke prompt updated" }),
    },
    200,
    "patch prompt metadata",
  );
  if (patched.prompt.version !== 2) throw new Error("metadata update did not bump version");

  const stalePatch = await fetch(`${baseUrl}/api/v1/projects/${projectId}/prompts/${promptId}`, {
    method: "PATCH",
    headers: mutationHeaders,
    body: JSON.stringify({ expectedVersion: 1, name: "Stale update" }),
  });
  assertStatus(stalePatch, 409, "stale prompt update");
  if (!(await stalePatch.text()).includes("PROMPT_VERSION_CONFLICT")) {
    throw new Error("stale update did not return the safe conflict code");
  }

  const invalidRevisionDetail = await requestJson(
    `/api/v1/projects/${projectId}/prompts/${promptId}/revisions`,
    {
      method: "POST",
      headers: mutationHeaders,
      body: JSON.stringify({
        expectedVersion: 2,
        content: "Не раскрывай {{env.secret}}.",
      }),
    },
    200,
    "create invalid prompt revision",
  );
  const invalidRevision = invalidRevisionDetail.revisions[0];
  if (!invalidRevision || invalidRevision.validation.isPublishable) {
    throw new Error("unknown prompt variable was not detected");
  }

  const invalidPublish = await fetch(
    `${baseUrl}/api/v1/projects/${projectId}/prompts/${promptId}/publish`,
    {
      method: "POST",
      headers: mutationHeaders,
      body: JSON.stringify({ expectedVersion: 3, revisionId: invalidRevision.id }),
    },
  );
  assertStatus(invalidPublish, 422, "publish invalid prompt revision");
  if (!(await invalidPublish.text()).includes("PROMPT_TEMPLATE_INVALID")) {
    throw new Error("invalid prompt publication did not return its policy code");
  }

  const revised = await requestJson(
    `/api/v1/projects/${projectId}/prompts/${promptId}/revisions`,
    {
      method: "POST",
      headers: mutationHeaders,
      body: JSON.stringify({
        expectedVersion: 3,
        content:
          "Ты консультант проекта {{project.name}}. Используй базу знаний и не выдумывай факты.",
      }),
    },
    200,
    "create prompt revision",
  );
  const revisionOne = revised.revisions.find((revision) => revision.revisionNo === 1);
  const revisionThree = revised.revisions.find((revision) => revision.revisionNo === 3);
  if (!revisionOne || !revisionThree || revised.prompt.version !== 4) {
    throw new Error("prompt revision history is incomplete");
  }

  const published = await requestJson(
    `/api/v1/projects/${projectId}/prompts/${promptId}/publish`,
    {
      method: "POST",
      headers: mutationHeaders,
      body: JSON.stringify({ expectedVersion: 4, revisionId: revisionThree.id }),
    },
    200,
    "publish revision three",
  );
  if (published.prompt.status !== "published" || published.prompt.publishedRevisionNo !== 3) {
    throw new Error("revision three was not activated");
  }

  const runtime = await requestJson(
    `/api/v1/projects/${projectId}/prompt-publication`,
    { headers: authenticatedHeaders },
    200,
    "resolve published prompt",
  );
  if (
    runtime.promptRevisionId !== revisionThree.id ||
    !runtime.assistantPublicId.startsWith("asst_")
  ) {
    throw new Error("runtime prompt resolver returned another revision");
  }

  const rolledBack = await requestJson(
    `/api/v1/projects/${projectId}/prompts/${promptId}/publish`,
    {
      method: "POST",
      headers: mutationHeaders,
      body: JSON.stringify({ expectedVersion: 5, revisionId: revisionOne.id }),
    },
    200,
    "rollback to revision one",
  );
  if (rolledBack.prompt.publishedRevisionNo !== 1 || !rolledBack.activePublication?.supersedesId) {
    throw new Error("rollback did not create a publication chain");
  }

  const archiveActive = await fetch(
    `${baseUrl}/api/v1/projects/${projectId}/prompts/${promptId}/archive`,
    {
      method: "POST",
      headers: mutationHeaders,
      body: JSON.stringify({ expectedVersion: 6 }),
    },
  );
  assertStatus(archiveActive, 409, "archive active prompt");
  if (!(await archiveActive.text()).includes("PROMPT_ACTIVE_PUBLICATION")) {
    throw new Error("active archive did not return its policy code");
  }

  const deleteUsed = await fetch(
    `${baseUrl}/api/v1/projects/${projectId}/prompts/${promptId}?expectedVersion=6`,
    { method: "DELETE", headers: mutationHeaders },
  );
  assertStatus(deleteUsed, 409, "delete published prompt");
  if (!(await deleteUsed.text()).includes("PROMPT_DELETE_REQUIRES_ARCHIVE")) {
    throw new Error("published delete did not return its policy code");
  }

  const audit = await requestJson(
    `/api/v1/projects/${projectId}/audit`,
    { headers: authenticatedHeaders },
    200,
    "prompt audit",
  );
  for (const action of [
    "prompt.created",
    "prompt.metadata_updated",
    "prompt.revision_created",
    "prompt.published",
    "prompt.rolled_back",
  ]) {
    if (!audit.some((event) => event.action === action)) {
      throw new Error(`prompt audit action is missing: ${action}`);
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
  "Prompt smoke passed: CRUD, immutable revisions, conflict, publish, rollback, resolver and policies",
);
