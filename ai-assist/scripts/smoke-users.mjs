import { randomUUID } from "node:crypto";

import { createDatabase } from "../packages/database/dist/src/index.js";

const baseUrl = process.env.AI_ASSIST_SMOKE_BASE_URL ?? "http://localhost:3000";
const adminPassword = process.env.AI_ASSIST_DEV_OWNER_PASSWORD ?? "LocalDev-ChangeMe-2026!";
const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://ai_assist:change-me-local-only@localhost:55432/ai_assist";
const database = createDatabase(databaseUrl);
const originHeaders = { origin: baseUrl, "sec-fetch-site": "same-origin" };

const assertStatus = async (response, expected, label) => {
  if (response.status === expected) return;
  throw new Error(
    `${label}: expected ${expected}, received ${response.status}: ${await response.text()}`,
  );
};

const login = async (email, password) => {
  const response = await fetch(`${baseUrl}/api/v1/auth/login`, {
    method: "POST",
    headers: { ...originHeaders, "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  await assertStatus(response, 200, `login ${email}`);
  const body = await response.json();
  return {
    body,
    cookie: response.headers
      .getSetCookie()
      .map((cookie) => cookie.split(";", 1)[0])
      .join("; "),
  };
};

const unique = `${Date.now()}-${randomUUID().slice(0, 8)}`;
const userEmail = `user-${unique}@example.test`;
const userPassword = `Temporary-${unique}-Aa1!`;
let userId = null;
let projectId = null;

try {
  const admin = await login("owner@gofroprodpak.local", adminPassword);
  if (admin.body.user?.role !== "admin" || !admin.body.user?.name || !admin.body.csrfToken) {
    throw new Error("administrator session does not expose the product role and name");
  }
  const adminMutationHeaders = {
    ...originHeaders,
    cookie: admin.cookie,
    "content-type": "application/json",
    "x-csrf-token": admin.body.csrfToken,
  };
  const usersPage = await fetch(`${baseUrl}/users`, { headers: { cookie: admin.cookie } });
  await assertStatus(usersPage, 200, "administrator opens users page");
  if (!(await usersPage.text()).includes("Пользователи")) {
    throw new Error("users page was not rendered");
  }

  const createdUserResponse = await fetch(`${baseUrl}/api/v1/users`, {
    method: "POST",
    headers: adminMutationHeaders,
    body: JSON.stringify({
      name: "Smoke пользователь",
      email: userEmail,
      password: userPassword,
      role: "user",
      projectIds: [],
    }),
  });
  await assertStatus(createdUserResponse, 200, "create user");
  const createdUser = await createdUserResponse.json();
  userId = createdUser.id;
  if (createdUser.role !== "user" || createdUser.projectIds.length !== 0) {
    throw new Error("created user has an unexpected role or project access");
  }

  const invalidAssignment = await fetch(`${baseUrl}/api/v1/projects`, {
    method: "POST",
    headers: adminMutationHeaders,
    body: JSON.stringify({ name: "Invalid assignment", userIds: [randomUUID()] }),
  });
  await assertStatus(invalidAssignment, 400, "reject unknown project participant");

  const projectResponse = await fetch(`${baseUrl}/api/v1/projects`, {
    method: "POST",
    headers: adminMutationHeaders,
    body: JSON.stringify({
      name: `Users smoke ${unique}`,
      timezone: "Europe/Moscow",
      templateProjectId: null,
      userIds: [userId],
    }),
  });
  await assertStatus(projectResponse, 200, "create assigned project");
  projectId = (await projectResponse.json()).id;

  const user = await login(userEmail, userPassword);
  if (
    user.body.user?.role !== "user" ||
    user.body.projects?.length !== 1 ||
    user.body.projects[0]?.id !== projectId ||
    user.body.projects[0]?.role !== "viewer"
  ) {
    throw new Error("ordinary user session is not limited to the assigned project");
  }
  const userHeaders = { cookie: user.cookie };
  const userMutationHeaders = {
    ...originHeaders,
    ...userHeaders,
    "content-type": "application/json",
    "x-csrf-token": user.body.csrfToken,
  };

  await assertStatus(
    await fetch(`${baseUrl}/api/v1/projects/${projectId}/knowledge`, { headers: userHeaders }),
    200,
    "user reads assigned knowledge state",
  );
  await assertStatus(
    await fetch(`${baseUrl}/api/v1/users`, { headers: userHeaders }),
    403,
    "user cannot manage users",
  );
  const protectedUsersPage = await fetch(`${baseUrl}/users`, {
    headers: userHeaders,
    redirect: "manual",
  });
  await assertStatus(protectedUsersPage, 302, "user cannot open users page");
  const protectedComponentsPage = await fetch(`${baseUrl}/projects/${projectId}/components`, {
    headers: userHeaders,
    redirect: "manual",
  });
  await assertStatus(protectedComponentsPage, 302, "user cannot open components page");
  await assertStatus(
    await fetch(`${baseUrl}/api/v1/projects/${projectId}`, {
      method: "PATCH",
      headers: userMutationHeaders,
      body: JSON.stringify({ name: "Forbidden update" }),
    }),
    403,
    "user cannot update project",
  );
  await assertStatus(
    await fetch(`${baseUrl}/api/v1/projects`, {
      method: "POST",
      headers: userMutationHeaders,
      body: JSON.stringify({ name: "Forbidden project" }),
    }),
    403,
    "user cannot create project",
  );

  const disabledResponse = await fetch(`${baseUrl}/api/v1/users/${userId}`, {
    method: "PATCH",
    headers: adminMutationHeaders,
    body: JSON.stringify({ status: "disabled" }),
  });
  await assertStatus(disabledResponse, 200, "disable user");
  await assertStatus(
    await fetch(`${baseUrl}/api/v1/auth/session`, { headers: userHeaders }),
    401,
    "disabled user session is revoked",
  );
} finally {
  if (projectId) {
    await database.client`delete from audit_events where project_id = ${projectId}`;
    await database.client`delete from projects where id = ${projectId}`;
  }
  if (userId) {
    await database.client`delete from audit_events where resource_type = 'user' and resource_id = ${userId}`;
    await database.client`delete from users where id = ${userId}`;
  }
  await database.client.end({ timeout: 5 });
}

console.log(
  "Users smoke passed: roles, project assignment, read-only access and session revocation",
);
