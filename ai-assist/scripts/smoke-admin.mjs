const baseUrl = process.env.AI_ASSIST_SMOKE_BASE_URL ?? "http://localhost:3000";
const password = process.env.AI_ASSIST_DEV_OWNER_PASSWORD ?? "LocalDev-ChangeMe-2026!";
const originHeaders = {
  origin: baseUrl,
  "sec-fetch-site": "same-origin",
};

const assertStatus = (response, expected, label) => {
  if (response.status !== expected) {
    throw new Error(`${label}: expected ${expected}, received ${response.status}`);
  }
};

const unauthorized = await fetch(`${baseUrl}/api/v1/auth/session`);
assertStatus(unauthorized, 401, "anonymous session");

const invalidLogin = await fetch(`${baseUrl}/api/v1/auth/login`, {
  method: "POST",
  headers: { ...originHeaders, "content-type": "application/json" },
  body: JSON.stringify({
    email: "owner@gofroprodpak.local",
    password,
    role: "owner",
  }),
});
assertStatus(invalidLogin, 400, "strict login contract");

const login = await fetch(`${baseUrl}/api/v1/auth/login`, {
  method: "POST",
  headers: { ...originHeaders, "content-type": "application/json" },
  body: JSON.stringify({
    email: "owner@gofroprodpak.local",
    password,
  }),
});
assertStatus(login, 200, "login");

const loginBody = await login.json();
const project = loginBody.projects?.[0];
if (!project?.id || !loginBody.csrfToken) {
  throw new Error("login: project or CSRF token is missing");
}

const cookieHeader = login.headers
  .getSetCookie()
  .map((cookie) => cookie.split(";", 1)[0])
  .join("; ");

const session = await fetch(`${baseUrl}/api/v1/auth/session`, {
  headers: { cookie: cookieHeader },
});
assertStatus(session, 200, "authenticated session");

const invalidReauthentication = await fetch(`${baseUrl}/api/v1/auth/reauthenticate`, {
  method: "POST",
  headers: {
    ...originHeaders,
    cookie: cookieHeader,
    "content-type": "application/json",
    "x-csrf-token": loginBody.csrfToken,
  },
  body: JSON.stringify({ password, email: "owner@gofroprodpak.local" }),
});
assertStatus(invalidReauthentication, 400, "strict reauthentication contract");

const wrongReauthentication = await fetch(`${baseUrl}/api/v1/auth/reauthenticate`, {
  method: "POST",
  headers: {
    ...originHeaders,
    cookie: cookieHeader,
    "content-type": "application/json",
    "x-csrf-token": loginBody.csrfToken,
  },
  body: JSON.stringify({ password: `${password}-wrong` }),
});
assertStatus(wrongReauthentication, 401, "wrong reauthentication password");

const reauthentication = await fetch(`${baseUrl}/api/v1/auth/reauthenticate`, {
  method: "POST",
  headers: {
    ...originHeaders,
    cookie: cookieHeader,
    "content-type": "application/json",
    "x-csrf-token": loginBody.csrfToken,
  },
  body: JSON.stringify({ password }),
});
assertStatus(reauthentication, 200, "reauthentication");
const reauthenticationBody = await reauthentication.json();
if (reauthenticationBody.status !== "ok" || reauthenticationBody.validForMinutes !== 30) {
  throw new Error("reauthentication: invalid response");
}

const missingCsrf = await fetch(`${baseUrl}/api/v1/projects/${project.id}`, {
  method: "PATCH",
  headers: { ...originHeaders, cookie: cookieHeader, "content-type": "application/json" },
  body: JSON.stringify({ name: project.name }),
});
assertStatus(missingCsrf, 403, "missing CSRF");

const foreignProject = await fetch(
  `${baseUrl}/api/v1/projects/00000000-0000-4000-8000-000000000001`,
  {
    headers: { cookie: cookieHeader },
  },
);
assertStatus(foreignProject, 404, "foreign project scope");

const update = await fetch(`${baseUrl}/api/v1/projects/${project.id}`, {
  method: "PATCH",
  headers: {
    ...originHeaders,
    cookie: cookieHeader,
    "content-type": "application/json",
    "x-csrf-token": loginBody.csrfToken,
  },
  body: JSON.stringify({ name: project.name }),
});
assertStatus(update, 200, "authorized project update");

const audit = await fetch(`${baseUrl}/api/v1/projects/${project.id}/audit`, {
  headers: { cookie: cookieHeader },
});
assertStatus(audit, 200, "audit list");
const auditBody = await audit.json();
if (!auditBody.some((event) => event.action === "project.updated")) {
  throw new Error("audit list: project.updated event is missing");
}
if (!auditBody.some((event) => event.action === "auth.reauthenticated")) {
  throw new Error("audit list: auth.reauthenticated event is missing");
}

const logout = await fetch(`${baseUrl}/api/v1/auth/logout`, {
  method: "POST",
  headers: {
    ...originHeaders,
    cookie: cookieHeader,
    "x-csrf-token": loginBody.csrfToken,
  },
});
assertStatus(logout, 200, "logout");

const revokedSession = await fetch(`${baseUrl}/api/v1/auth/session`, {
  headers: { cookie: cookieHeader },
});
assertStatus(revokedSession, 401, "revoked session");

console.log("Admin smoke passed: auth, reauthentication, tenant scope, CSRF, audit, logout");
