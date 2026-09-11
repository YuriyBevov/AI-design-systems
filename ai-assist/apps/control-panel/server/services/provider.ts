import { randomUUID } from "node:crypto";

import type {
  ModelCapability,
  ModelCatalogResponse,
  ProjectModelSettingsResponse,
  ProviderCredentialResponse,
  ProviderCredentialTestResponse,
  ProviderStateResponse,
  ProviderVerificationMetadata,
  SyncModelsResponse,
  UpdateProjectModelSettingsRequest,
} from "@ai-assist/contracts";
import { isLocalCredentialEncryptionKey } from "@ai-assist/config";
import {
  createCredentialAssociatedData,
  createCredentialKeyring,
  decryptCredential,
  encryptCredential,
  maskProviderKey,
} from "@ai-assist/domain";
import {
  AitunnelClient,
  AitunnelProviderError,
  type CredentialVerification,
} from "@ai-assist/provider-aitunnel";
import { createError, isError, type H3Event } from "h3";

import { writeAuditEvent } from "../repositories/audit";
import {
  deleteProviderCredential,
  findProjectModelSettings,
  findProviderCredential,
  findProviderModel,
  listProviderModels,
  replaceProviderModelCatalog,
  updateProviderCredentialVerification,
  upsertProjectModelSettings,
  upsertProviderCredential,
  type ProviderCredentialRecord,
} from "../repositories/provider";
import { getServiceEnvironment } from "../utils/infrastructure";
import { getRequestId } from "../utils/request";
import {
  assertCsrf,
  assertRecentAdminAuthentication,
  requireAdminSession,
  requireProjectScope,
} from "./auth";

const provider = "aitunnel" as const;
let encryptionKeysCache: Map<number, Buffer> | undefined;

const toVerificationMetadata = (
  verification: CredentialVerification,
): ProviderVerificationMetadata => ({ ...verification });

const toCredentialResponse = (
  credential: ProviderCredentialRecord,
): ProviderCredentialResponse => ({
  id: credential.id,
  provider,
  maskedHint: credential.maskedHint,
  status: credential.status,
  keyVersion: credential.keyVersion,
  lastVerifiedAt: credential.lastVerifiedAt?.toISOString() ?? null,
  lastErrorCode: credential.lastErrorCode,
  verification: credential.verificationMetadata,
  updatedAt: credential.updatedAt.toISOString(),
});

export const getAitunnelClient = (): AitunnelClient => {
  const environment = getServiceEnvironment();
  return new AitunnelClient({
    baseUrl: environment.AITUNNEL_BASE_URL,
    publicCatalogUrl: environment.AITUNNEL_PUBLIC_CATALOG_URL,
    timeoutMs: environment.PROVIDER_REQUEST_TIMEOUT_MS,
    maxResponseBytes: environment.PROVIDER_RESPONSE_MAX_BYTES,
  });
};

const getEncryptionKeys = (): Map<number, Buffer> => {
  if (encryptionKeysCache) return encryptionKeysCache;

  const environment = getServiceEnvironment();
  encryptionKeysCache = createCredentialKeyring({
    currentVersion: environment.CREDENTIAL_ENCRYPTION_KEY_VERSION,
    currentKey: environment.CREDENTIAL_ENCRYPTION_KEY,
    previousKeysJson: environment.CREDENTIAL_ENCRYPTION_PREVIOUS_KEYS,
  });
  return encryptionKeysCache;
};

const providerErrorStatus = (error: AitunnelProviderError): number => {
  switch (error.code) {
    case "PROVIDER_CREDENTIAL_INVALID":
    case "PROVIDER_MODEL_UNAVAILABLE":
    case "PROVIDER_BAD_RESPONSE":
      return 422;
    case "PROVIDER_BUDGET_EXCEEDED":
      return 402;
    case "PROVIDER_RATE_LIMITED":
      return 429;
    case "PROVIDER_TIMEOUT":
      return 504;
    case "PROVIDER_UNAVAILABLE":
      return 503;
  }
};

export const throwProviderHttpError = (error: unknown): never => {
  if (isError(error)) throw error;

  if (!(error instanceof AitunnelProviderError)) {
    throw createError({ statusCode: 500, statusMessage: "Provider operation failed" });
  }

  throw createError({
    statusCode: providerErrorStatus(error),
    statusMessage: "AITUNNEL request failed",
    data: { code: error.code, retryable: error.retryable },
  });
};

const getProviderErrorCode = (error: unknown, fallback: string): string => {
  if (error instanceof AitunnelProviderError) return error.code;
  if (isError<{ code?: unknown }>(error) && error.data && typeof error.data.code === "string") {
    return error.data.code;
  }
  return fallback;
};

export const decryptStoredProviderCredential = (credential: ProviderCredentialRecord): string => {
  let keys: Map<number, Buffer>;
  try {
    keys = getEncryptionKeys();
  } catch {
    throw createError({
      statusCode: 503,
      statusMessage: "Credential encryption configuration is invalid",
      data: { code: "CREDENTIAL_ENCRYPTION_KEY_INVALID", retryable: false },
    });
  }

  const key = keys.get(credential.keyVersion);
  if (!key) {
    throw createError({
      statusCode: 503,
      statusMessage: "Credential key version is unavailable",
      data: { code: "CREDENTIAL_KEY_VERSION_UNAVAILABLE", retryable: false },
    });
  }

  try {
    return decryptCredential({
      envelope: {
        ciphertext: credential.ciphertext,
        nonce: credential.nonce,
        authTag: credential.authTag,
        keyVersion: credential.keyVersion,
      },
      associatedData: createCredentialAssociatedData({
        projectId: credential.projectId,
        credentialId: credential.id,
        provider: credential.provider,
      }),
      key,
    });
  } catch {
    throw createError({
      statusCode: 503,
      statusMessage: "Stored credential cannot be decrypted",
      data: { code: "CREDENTIAL_DECRYPTION_FAILED", retryable: false },
    });
  }
};

export const getProviderState = async (
  event: H3Event,
  projectId: string,
): Promise<ProviderStateResponse> => {
  const { project } = await requireProjectScope(event, projectId, "owner");
  const credential = await findProviderCredential(project.id);
  return { provider, credential: credential ? toCredentialResponse(credential) : null };
};

export const saveProviderCredential = async (
  event: H3Event,
  projectId: string,
  apiKey: string,
): Promise<ProviderStateResponse> => {
  const { session, project } = await requireProjectScope(event, projectId, "owner");
  assertCsrf(event, session);
  assertRecentAdminAuthentication(session);
  const existing = await findProviderCredential(project.id);
  const credentialId = existing?.id ?? randomUUID();
  const environment = getServiceEnvironment();
  if (isLocalCredentialEncryptionKey(environment.CREDENTIAL_ENCRYPTION_KEY)) {
    await writeAuditEvent({
      projectId: project.id,
      actorUserId: session.userId,
      action: "provider.credential_save_failed",
      resourceType: "provider_credential",
      requestId: getRequestId(event),
      metadata: { provider, errorCode: "CREDENTIAL_ENCRYPTION_KEY_REQUIRED" },
    });
    throw createError({
      statusCode: 503,
      statusMessage: "Credential encryption key is not configured",
      data: { code: "CREDENTIAL_ENCRYPTION_KEY_REQUIRED", retryable: false },
    });
  }

  let key: Buffer;
  try {
    const configuredKey = getEncryptionKeys().get(environment.CREDENTIAL_ENCRYPTION_KEY_VERSION);
    if (!configuredKey) throw new Error("Current credential encryption key is unavailable");
    key = configuredKey;
  } catch {
    await writeAuditEvent({
      projectId: project.id,
      actorUserId: session.userId,
      action: "provider.credential_save_failed",
      resourceType: "provider_credential",
      requestId: getRequestId(event),
      metadata: { provider, errorCode: "CREDENTIAL_ENCRYPTION_KEY_INVALID" },
    });
    throw createError({
      statusCode: 503,
      statusMessage: "Credential encryption configuration is invalid",
      data: { code: "CREDENTIAL_ENCRYPTION_KEY_INVALID", retryable: false },
    });
  }

  let verification: CredentialVerification;

  try {
    verification = await getAitunnelClient().verifyCredential(apiKey);
  } catch (error) {
    await writeAuditEvent({
      projectId: project.id,
      actorUserId: session.userId,
      action: "provider.credential_save_failed",
      resourceType: "provider_credential",
      requestId: getRequestId(event),
      metadata: {
        provider,
        errorCode: getProviderErrorCode(error, "PROVIDER_OPERATION_FAILED"),
      },
    });
    return throwProviderHttpError(error);
  }

  const envelope = encryptCredential({
    plaintext: apiKey,
    associatedData: createCredentialAssociatedData({
      projectId: project.id,
      credentialId,
      provider,
    }),
    key,
    keyVersion: environment.CREDENTIAL_ENCRYPTION_KEY_VERSION,
  });
  const verifiedAt = new Date();
  await upsertProviderCredential({
    id: credentialId,
    projectId: project.id,
    ...envelope,
    maskedHint: maskProviderKey(apiKey),
    verifiedAt,
    verificationMetadata: toVerificationMetadata(verification),
  });
  await writeAuditEvent({
    projectId: project.id,
    actorUserId: session.userId,
    action: existing ? "provider.credential_replaced" : "provider.credential_saved",
    resourceType: "provider_credential",
    resourceId: credentialId,
    requestId: getRequestId(event),
    metadata: { provider, keyVersion: envelope.keyVersion },
  });

  return getProviderState(event, project.id);
};

export const testStoredProviderCredential = async (
  event: H3Event,
  projectId: string,
): Promise<ProviderCredentialTestResponse> => {
  const { session, project } = await requireProjectScope(event, projectId, "owner");
  assertCsrf(event, session);
  assertRecentAdminAuthentication(session);
  const credential = await findProviderCredential(project.id);
  if (!credential) {
    throw createError({ statusCode: 404, statusMessage: "Provider credential not found" });
  }

  try {
    const verification = await getAitunnelClient().verifyCredential(
      decryptStoredProviderCredential(credential),
    );
    const verifiedAt = new Date();
    const metadata = toVerificationMetadata(verification);
    await updateProviderCredentialVerification({
      credentialId: credential.id,
      status: "verified",
      verifiedAt,
      errorCode: null,
      verificationMetadata: metadata,
    });
    await writeAuditEvent({
      projectId: project.id,
      actorUserId: session.userId,
      action: "provider.credential_tested",
      resourceType: "provider_credential",
      resourceId: credential.id,
      requestId: getRequestId(event),
      metadata: { provider, result: "verified" },
    });
    return { status: "verified", lastVerifiedAt: verifiedAt.toISOString(), verification: metadata };
  } catch (error) {
    const errorCode = getProviderErrorCode(error, "PROVIDER_OPERATION_FAILED");
    await updateProviderCredentialVerification({
      credentialId: credential.id,
      status: errorCode === "PROVIDER_CREDENTIAL_INVALID" ? "invalid" : credential.status,
      verifiedAt: credential.lastVerifiedAt,
      errorCode,
    });
    await writeAuditEvent({
      projectId: project.id,
      actorUserId: session.userId,
      action: "provider.credential_test_failed",
      resourceType: "provider_credential",
      resourceId: credential.id,
      requestId: getRequestId(event),
      metadata: { provider, errorCode },
    });
    return throwProviderHttpError(error);
  }
};

export const removeProviderCredential = async (
  event: H3Event,
  projectId: string,
): Promise<void> => {
  const { session, project } = await requireProjectScope(event, projectId, "owner");
  assertCsrf(event, session);
  assertRecentAdminAuthentication(session);
  const credential = await findProviderCredential(project.id);
  if (!credential) return;

  await deleteProviderCredential(credential.id);
  await writeAuditEvent({
    projectId: project.id,
    actorUserId: session.userId,
    action: "provider.credential_deleted",
    resourceType: "provider_credential",
    resourceId: credential.id,
    requestId: getRequestId(event),
    metadata: { provider },
  });
};

export const syncProviderModels = async (
  event: H3Event,
  projectId: string,
): Promise<SyncModelsResponse> => {
  const { session, project } = await requireProjectScope(event, projectId, "owner");
  assertCsrf(event, session);
  const catalog = await getAitunnelClient().fetchModelCatalog();
  const syncedAt = new Date();
  await replaceProviderModelCatalog(catalog, syncedAt);
  const counts = {
    chat: catalog.chat.length,
    embeddings: catalog.embeddings.length,
    rerank: catalog.rerank.length,
  };
  await writeAuditEvent({
    projectId: project.id,
    actorUserId: session.userId,
    action: "provider.models_synced",
    resourceType: "provider_model_catalog",
    requestId: getRequestId(event),
    metadata: { provider, counts },
  });
  return { counts, syncedAt: syncedAt.toISOString() };
};

export const getProviderModels = async (
  event: H3Event,
  capability?: ModelCapability,
): Promise<ModelCatalogResponse> => {
  await requireAdminSession(event);
  const models = await listProviderModels(capability);
  const lastSyncedAt = models.reduce<Date | null>(
    (latest, model) => (!latest || model.fetchedAt > latest ? model.fetchedAt : latest),
    null,
  );

  return {
    models: models.map((model) => ({
      id: model.modelId,
      provider,
      capability: model.capability,
      upstreamProvider: model.upstreamProvider,
      description: model.description,
      inputModalities: model.inputModalities,
      outputModalities: model.outputModalities,
      contextSize: model.contextSize,
      maxOutput: model.maxOutput,
      maxTokens: model.maxTokens,
      pricing: model.pricing,
      available: model.available,
      fetchedAt: model.fetchedAt.toISOString(),
    })),
    lastSyncedAt: lastSyncedAt?.toISOString() ?? null,
  };
};

const validateSelectedModel = async (
  modelId: string | null,
  capability: ModelCapability,
): Promise<void> => {
  if (!modelId) return;
  if (capability === "embeddings" && modelId === "auto") {
    throw createError({ statusCode: 422, statusMessage: "Auto is not allowed for embeddings" });
  }

  const model = await findProviderModel(modelId, capability);
  if (!model || !model.available) {
    throw createError({ statusCode: 422, statusMessage: `${capability} model is unavailable` });
  }

  const expectedOutput =
    capability === "chat" ? "text" : capability === "embeddings" ? "embedding" : "rerank";
  if (!model.inputModalities.includes("text") || !model.outputModalities.includes(expectedOutput)) {
    throw createError({ statusCode: 422, statusMessage: `${capability} model is incompatible` });
  }
};

export const getProjectModelSettings = async (
  event: H3Event,
  projectId: string,
): Promise<ProjectModelSettingsResponse> => {
  const { project } = await requireProjectScope(event, projectId);
  const settings = await findProjectModelSettings(project.id);
  return {
    projectId: project.id,
    chatModelId: settings?.chatModelId ?? null,
    embeddingModelId: settings?.embeddingModelId ?? null,
    rerankModelId: settings?.rerankModelId ?? null,
    embeddingDimension: settings?.embeddingDimension ?? null,
    maxOutputTokens: settings?.maxOutputTokens ?? 1500,
    temperature: settings?.temperature ?? null,
    updatedAt: settings?.updatedAt.toISOString() ?? null,
  };
};

export const updateProjectModelSettings = async (
  event: H3Event,
  projectId: string,
  update: UpdateProjectModelSettingsRequest,
): Promise<ProjectModelSettingsResponse> => {
  const { session, project } = await requireProjectScope(event, projectId, "owner");
  assertCsrf(event, session);
  const current = await findProjectModelSettings(project.id);
  const next = {
    chatModelId:
      update.chatModelId !== undefined ? update.chatModelId : (current?.chatModelId ?? null),
    embeddingModelId:
      update.embeddingModelId !== undefined
        ? update.embeddingModelId
        : (current?.embeddingModelId ?? null),
    rerankModelId:
      update.rerankModelId !== undefined ? update.rerankModelId : (current?.rerankModelId ?? null),
    maxOutputTokens: update.maxOutputTokens ?? current?.maxOutputTokens ?? 1500,
    temperature:
      update.temperature !== undefined ? update.temperature : (current?.temperature ?? null),
    embeddingDimension:
      current?.embeddingModelId ===
      (update.embeddingModelId !== undefined
        ? update.embeddingModelId
        : (current?.embeddingModelId ?? null))
        ? (current?.embeddingDimension ?? null)
        : null,
  };

  await Promise.all([
    validateSelectedModel(next.chatModelId, "chat"),
    validateSelectedModel(next.embeddingModelId, "embeddings"),
    validateSelectedModel(next.rerankModelId, "rerank"),
  ]);
  if (next.chatModelId) {
    const chatModel = await findProviderModel(next.chatModelId, "chat");
    if (chatModel?.maxOutput && next.maxOutputTokens > chatModel.maxOutput) {
      throw createError({ statusCode: 422, statusMessage: "maxOutputTokens exceeds model limit" });
    }
  }

  await upsertProjectModelSettings({
    projectId: project.id,
    ...next,
    updatedBy: session.userId,
  });
  await writeAuditEvent({
    projectId: project.id,
    actorUserId: session.userId,
    action: "provider.model_settings_updated",
    resourceType: "project_model_settings",
    resourceId: project.id,
    requestId: getRequestId(event),
    metadata: { changedFields: Object.keys(update) },
  });
  return getProjectModelSettings(event, project.id);
};
