const baseUrl = process.env.AI_ASSIST_SMOKE_BASE_URL ?? "http://localhost:3000";
const password = process.env.AI_ASSIST_DEV_OWNER_PASSWORD ?? "LocalDev-ChangeMe-2026!";
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

const providerState = await fetch(`${baseUrl}/api/v1/projects/${projectId}/provider`, {
  headers: authenticatedHeaders,
});
assertStatus(providerState, 200, "provider state");
const providerText = await providerState.text();
for (const forbiddenField of ["apiKey", "ciphertext", "nonce", "authTag"]) {
  if (providerText.includes(forbiddenField)) {
    throw new Error(`provider state leaked forbidden field: ${forbiddenField}`);
  }
}

const malformedCredential = await fetch(
  `${baseUrl}/api/v1/projects/${projectId}/provider/credential`,
  {
    method: "PUT",
    headers: mutationHeaders,
    body: JSON.stringify({ apiKey: "not-a-provider-key" }),
  },
);
assertStatus(malformedCredential, 400, "credential format validation");

const sync = await fetch(`${baseUrl}/api/v1/models/sync`, {
  method: "POST",
  headers: mutationHeaders,
  body: JSON.stringify({ projectId }),
});
assertStatus(sync, 200, "public model catalog sync");

const catalog = await fetch(`${baseUrl}/api/v1/models`, { headers: authenticatedHeaders });
assertStatus(catalog, 200, "model catalog");
const catalogBody = await catalog.json();
const chatModel = catalogBody.models.find(
  (model) =>
    model.available &&
    model.capability === "chat" &&
    model.inputModalities.includes("text") &&
    model.outputModalities.includes("text"),
);
const embeddingModel = catalogBody.models.find(
  (model) =>
    model.available &&
    model.capability === "embeddings" &&
    model.id !== "auto" &&
    model.inputModalities.includes("text") &&
    model.outputModalities.includes("embedding"),
);
if (!chatModel || !embeddingModel) throw new Error("catalog: required capabilities are missing");

const originalSettingsResponse = await fetch(
  `${baseUrl}/api/v1/projects/${projectId}/model-settings`,
  { headers: authenticatedHeaders },
);
assertStatus(originalSettingsResponse, 200, "read model settings");
const originalSettings = await originalSettingsResponse.json();

const updateSettings = async (settings) => {
  const response = await fetch(`${baseUrl}/api/v1/projects/${projectId}/model-settings`, {
    method: "PUT",
    headers: mutationHeaders,
    body: JSON.stringify(settings),
  });
  assertStatus(response, 200, "update model settings");
  return response.json();
};

const updated = await updateSettings({
  chatModelId: chatModel.id,
  embeddingModelId: embeddingModel.id,
  rerankModelId: null,
  maxOutputTokens: Math.min(chatModel.maxOutput ?? 1500, 1500),
  temperature: null,
});
if (updated.chatModelId !== chatModel.id || updated.embeddingModelId !== embeddingModel.id) {
  throw new Error("model settings: saved values differ");
}

await updateSettings({
  chatModelId: originalSettings.chatModelId,
  embeddingModelId: originalSettings.embeddingModelId,
  rerankModelId: originalSettings.rerankModelId,
  maxOutputTokens: originalSettings.maxOutputTokens,
  temperature: originalSettings.temperature,
});

const autoEmbedding = await fetch(`${baseUrl}/api/v1/projects/${projectId}/model-settings`, {
  method: "PUT",
  headers: mutationHeaders,
  body: JSON.stringify({ embeddingModelId: "auto" }),
});
assertStatus(autoEmbedding, 422, "embedding auto validation");

const logout = await fetch(`${baseUrl}/api/v1/auth/logout`, {
  method: "POST",
  headers: mutationHeaders,
});
assertStatus(logout, 200, "logout");

console.log("Provider smoke passed: secret DTO, public catalog, capabilities, model settings");
