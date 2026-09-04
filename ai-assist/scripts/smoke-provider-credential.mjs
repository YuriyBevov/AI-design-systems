import { createDatabase } from "../packages/database/dist/src/index.js";

const baseUrl = process.env.AI_ASSIST_SMOKE_BASE_URL ?? "http://localhost:3000";
const password = process.env.AI_ASSIST_DEV_OWNER_PASSWORD ?? "LocalDev-ChangeMe-2026!";
const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://ai_assist:change-me-local-only@localhost:55432/ai_assist";
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
const database = createDatabase(databaseUrl);
let createdCredential = false;

const readEnvelope = async () => {
  const rows = await database.client`
    select ciphertext, nonce, auth_tag, masked_hint
    from provider_credentials
    where project_id = ${projectId} and provider = 'aitunnel'
    limit 1
  `;
  return rows[0] ?? null;
};

const saveCredential = async () => {
  const response = await fetch(`${baseUrl}/api/v1/projects/${projectId}/provider/credential`, {
    method: "PUT",
    headers: mutationHeaders,
    body: JSON.stringify({ apiKey: syntheticKey }),
  });
  assertStatus(response, 200, "save credential");
  const text = await response.text();
  if (text.includes(syntheticKey) || /ciphertext|authTag|nonce/u.test(text)) {
    throw new Error("save credential response leaked secret material");
  }
};

try {
  const initialState = await fetch(`${baseUrl}/api/v1/projects/${projectId}/provider`, {
    headers: authenticatedHeaders,
  });
  assertStatus(initialState, 200, "initial provider state");
  const initialBody = await initialState.json();
  if (initialBody.credential) {
    throw new Error("credential smoke refuses to replace an existing credential");
  }

  await saveCredential();
  createdCredential = true;
  const firstEnvelope = await readEnvelope();
  if (!firstEnvelope) throw new Error("credential row was not created");
  if (JSON.stringify(firstEnvelope).includes(syntheticKey)) {
    throw new Error("database row contains the plaintext credential");
  }
  if (!firstEnvelope.ciphertext || !firstEnvelope.nonce || !firstEnvelope.auth_tag) {
    throw new Error("credential envelope is incomplete");
  }

  await saveCredential();
  const secondEnvelope = await readEnvelope();
  if (!secondEnvelope) throw new Error("credential row disappeared after replace");
  if (
    secondEnvelope.ciphertext === firstEnvelope.ciphertext ||
    secondEnvelope.nonce === firstEnvelope.nonce
  ) {
    throw new Error("credential replacement reused ciphertext or nonce");
  }

  const testCredential = await fetch(
    `${baseUrl}/api/v1/projects/${projectId}/provider/credential/test`,
    { method: "POST", headers: mutationHeaders },
  );
  assertStatus(testCredential, 200, "test stored credential");
  const testedText = await testCredential.text();
  if (testedText.includes(syntheticKey)) throw new Error("credential test leaked plaintext");

  const audit = await fetch(`${baseUrl}/api/v1/projects/${projectId}/audit`, {
    headers: authenticatedHeaders,
  });
  assertStatus(audit, 200, "provider audit");
  const auditText = await audit.text();
  if (auditText.includes(syntheticKey)) throw new Error("audit leaked plaintext credential");
  for (const action of [
    "provider.credential_saved",
    "provider.credential_replaced",
    "provider.credential_tested",
  ]) {
    if (!auditText.includes(action)) throw new Error(`audit action is missing: ${action}`);
  }
} finally {
  if (createdCredential) {
    const deleted = await fetch(`${baseUrl}/api/v1/projects/${projectId}/provider/credential`, {
      method: "DELETE",
      headers: mutationHeaders,
    });
    assertStatus(deleted, 200, "delete synthetic credential");
  }
  await database.client.end({ timeout: 5 });
}

const afterDelete = await fetch(`${baseUrl}/api/v1/projects/${projectId}/provider`, {
  headers: authenticatedHeaders,
});
assertStatus(afterDelete, 200, "provider state after delete");
if ((await afterDelete.json()).credential !== null) throw new Error("credential was not deleted");

const logout = await fetch(`${baseUrl}/api/v1/auth/logout`, {
  method: "POST",
  headers: mutationHeaders,
});
assertStatus(logout, 200, "logout");

console.log(
  "Credential smoke passed: encrypted storage, random nonce, safe API/audit, test/delete",
);
