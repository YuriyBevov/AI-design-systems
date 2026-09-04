const baseUrl = process.env.AI_ASSIST_SMOKE_BASE_URL ?? "http://localhost:3000";
const password = process.env.AI_ASSIST_DEV_OWNER_PASSWORD ?? "LocalDev-ChangeMe-2026!";
const expectedErrorCode =
  process.env.AI_ASSIST_EXPECTED_ENCRYPTION_ERROR ?? "CREDENTIAL_ENCRYPTION_KEY_REQUIRED";
const syntheticKey = "sk-aitunnel-smoke-fake-key-0000";
const originHeaders = { origin: baseUrl, "sec-fetch-site": "same-origin" };

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
const projectId = loginBody.projects?.[0]?.id;
if (!projectId || !loginBody.csrfToken) throw new Error("login: project or CSRF token is missing");
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

const initialState = await fetch(`${baseUrl}/api/v1/projects/${projectId}/provider`, {
  headers: authenticatedHeaders,
});
assertStatus(initialState, 200, "initial provider state");
if ((await initialState.json()).credential) {
  throw new Error("encryption guard smoke refuses to run with an existing credential");
}

const save = await fetch(`${baseUrl}/api/v1/projects/${projectId}/provider/credential`, {
  method: "PUT",
  headers: mutationHeaders,
  body: JSON.stringify({ apiKey: syntheticKey }),
});
assertStatus(save, 503, "credential save with development encryption key");
const saveText = await save.text();
if (!saveText.includes(expectedErrorCode) || saveText.includes(syntheticKey)) {
  throw new Error("credential guard response is missing its safe code or leaked plaintext");
}

const afterSave = await fetch(`${baseUrl}/api/v1/projects/${projectId}/provider`, {
  headers: authenticatedHeaders,
});
assertStatus(afterSave, 200, "provider state after blocked save");
if ((await afterSave.json()).credential !== null) {
  throw new Error("blocked credential save created a database record");
}

const audit = await fetch(`${baseUrl}/api/v1/projects/${projectId}/audit`, {
  headers: authenticatedHeaders,
});
assertStatus(audit, 200, "provider guard audit");
const auditText = await audit.text();
if (
  !auditText.includes("provider.credential_save_failed") ||
  !auditText.includes(expectedErrorCode) ||
  auditText.includes(syntheticKey)
) {
  throw new Error("credential guard audit is incomplete or leaked plaintext");
}

const logout = await fetch(`${baseUrl}/api/v1/auth/logout`, {
  method: "POST",
  headers: mutationHeaders,
});
assertStatus(logout, 200, "logout");

console.log(
  `Credential encryption guard smoke passed: 503 ${expectedErrorCode}, no write, safe API/audit`,
);
