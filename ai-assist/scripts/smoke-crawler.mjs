import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

import { createDatabase } from "../packages/database/dist/src/index.js";

const baseUrl = process.env.AI_ASSIST_SMOKE_BASE_URL ?? "http://localhost:3000";
const password = process.env.AI_ASSIST_DEV_OWNER_PASSWORD ?? "LocalDev-ChangeMe-2026!";
const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://ai_assist:change-me-local-only@localhost:55432/ai_assist";
const database = createDatabase(databaseUrl);
const projectId = randomUUID();
const projectSlug = `crawler-smoke-${projectId}`;
const originHeaders = { origin: baseUrl, "sec-fetch-site": "same-origin" };
let projectCreated = false;

const assertStatus = (response, expected, label) => {
  if (response.status !== expected) {
    throw new Error(`${label}: expected ${expected}, received ${response.status}`);
  }
};

const requestJson = async (path, init, expected, label) => {
  const response = await fetch(`${baseUrl}${path}`, init);
  if (response.status !== expected) {
    throw new Error(
      `${label}: expected ${expected}, received ${response.status}: ${await response.text()}`,
    );
  }
  return response.json();
};

const waitForRun = async (project, runId, headers) => {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const detail = await requestJson(
      `/api/v1/projects/${project}/knowledge/crawl-runs/${runId}`,
      { headers },
      200,
      "crawl run detail",
    );
    if (!["queued", "running"].includes(detail.run.status)) return detail;
    await delay(1_000);
  }
  throw new Error("crawl run did not finish before the smoke timeout");
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
      'Crawler smoke tenant',
      ${projectSlug},
      'https://gofroprodpak.ru',
      'Europe/Moscow',
      'ru'
    )
  `;
  projectCreated = true;
  await database.client`
    insert into project_memberships (project_id, user_id, role)
    values (${projectId}, ${loginBody.user.id}, 'owner')
  `;

  const sourceBody = {
    name: "Полный режим с ограниченным smoke-лимитом",
    settings: {
      startUrl: "https://gofroprodpak.ru/catalog/",
      crawlMode: "full",
      includePathPrefixes: ["/catalog/"],
      excludePathPrefixes: ["/catalog/compare.php", "/catalog/test/"],
      maxPages: 3,
      maxDepth: 1,
      requestDelayMs: 250,
    },
  };
  const withoutCsrf = await fetch(`${baseUrl}/api/v1/projects/${projectId}/knowledge/sources`, {
    method: "POST",
    headers: { ...originHeaders, ...authenticatedHeaders, "content-type": "application/json" },
    body: JSON.stringify(sourceBody),
  });
  assertStatus(withoutCsrf, 403, "create source without CSRF");

  const strictRequest = await fetch(`${baseUrl}/api/v1/projects/${projectId}/knowledge/sources`, {
    method: "POST",
    headers: mutationHeaders,
    body: JSON.stringify({ ...sourceBody, apiKey: "forbidden" }),
  });
  assertStatus(strictRequest, 400, "source contract rejects secret fields");

  const structure = await requestJson(
    `/api/v1/projects/${projectId}/knowledge/sources/discover`,
    {
      method: "POST",
      headers: mutationHeaders,
      body: JSON.stringify({ startUrl: "https://gofroprodpak.ru/" }),
    },
    200,
    "discover site structure",
  );
  if (!structure.sections.some((section) => section.path === "/catalog/")) {
    throw new Error("site structure did not expose the first-level catalog section");
  }

  const source = await requestJson(
    `/api/v1/projects/${projectId}/knowledge/sources`,
    { method: "POST", headers: mutationHeaders, body: JSON.stringify(sourceBody) },
    200,
    "create URL source",
  );
  const firstRequest = await requestJson(
    `/api/v1/projects/${projectId}/knowledge/sources/${source.id}/crawl`,
    { method: "POST", headers: mutationHeaders },
    202,
    "request first crawl",
  );
  const first = await waitForRun(projectId, firstRequest.run.id, authenticatedHeaders);
  if (!["succeeded", "partial"].includes(first.run.status) || first.run.succeededCount < 1) {
    throw new Error(`first crawl failed: ${first.run.errorCode ?? first.run.status}`);
  }
  if (first.run.newCount < 1 || !first.pages.some((page) => page.documentId)) {
    throw new Error("first crawl did not create reviewable drafts");
  }
  if (!first.pages.some((page) => page.documentType === "product")) {
    throw new Error("first crawl did not extract a product from the live store profile");
  }
  const pagedResult = await requestJson(
    `/api/v1/projects/${projectId}/knowledge/crawl-runs/${first.run.id}?page=2&pageSize=1`,
    { headers: authenticatedHeaders },
    200,
    "load paginated crawl results",
  );
  if (
    pagedResult.pages.length !== 1 ||
    pagedResult.pagination.page !== 2 ||
    pagedResult.pagination.totalItems !== 3
  ) {
    throw new Error("crawl result pagination is inconsistent");
  }

  const selectedForPublication = first.pages
    .filter(
      (page) =>
        page.reviewStatus === "pending" &&
        ["new", "changed"].includes(page.changeType) &&
        page.documentId,
    )
    .slice(0, 2);
  if (selectedForPublication.length !== 2) {
    throw new Error("crawl did not create enough drafts for bulk publication");
  }
  const publication = await requestJson(
    `/api/v1/projects/${projectId}/knowledge/crawl-runs/${first.run.id}/publish`,
    {
      method: "POST",
      headers: mutationHeaders,
      body: JSON.stringify({
        selection: "selected",
        pageIds: selectedForPublication.map((page) => page.id),
      }),
    },
    200,
    "publish crawl drafts",
  );
  if (publication.publishedCount !== 2) throw new Error("selected crawl drafts were not published");
  const reviewed = await requestJson(
    `/api/v1/projects/${projectId}/knowledge/crawl-runs/${first.run.id}`,
    { headers: authenticatedHeaders },
    200,
    "load selectively published crawl",
  );
  if (reviewed.pages.filter((page) => page.reviewStatus === "approved").length !== 2) {
    throw new Error("bulk publication changed an unexpected number of pages");
  }
  if (!reviewed.pages.some((page) => page.reviewStatus === "pending")) {
    throw new Error("bulk publication ignored the unselected draft boundary");
  }
  const remainingPublication = await requestJson(
    `/api/v1/projects/${projectId}/knowledge/crawl-runs/${first.run.id}/publish`,
    {
      method: "POST",
      headers: mutationHeaders,
      body: JSON.stringify({ selection: "all" }),
    },
    200,
    "publish all remaining crawl drafts",
  );
  if (remainingPublication.publishedCount !== 1) {
    throw new Error("run-wide publication did not publish the remaining draft");
  }

  const secondRequest = await requestJson(
    `/api/v1/projects/${projectId}/knowledge/sources/${source.id}/crawl`,
    { method: "POST", headers: mutationHeaders },
    202,
    "request repeat crawl",
  );
  const second = await waitForRun(projectId, secondRequest.run.id, authenticatedHeaders);
  if (second.run.newCount !== 0 || second.run.changedCount !== 0 || second.run.unchangedCount < 1) {
    throw new Error("repeat crawl was not idempotent");
  }

  console.log(
    `Crawler smoke passed: ${first.run.succeededCount} pages, ${publication.publishedCount} selected + ${remainingPublication.publishedCount} remaining published, ${second.run.unchangedCount} unchanged on repeat`,
  );
} finally {
  if (projectCreated) await database.client`delete from projects where id = ${projectId}`;
  await database.client.end({ timeout: 5 });
}
