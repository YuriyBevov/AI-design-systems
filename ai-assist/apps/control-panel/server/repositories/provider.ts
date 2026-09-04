import { and, eq } from "drizzle-orm";

import {
  projectModelSettings,
  providerCredentials,
  providerModelCatalog,
} from "@ai-assist/database";
import type {
  ModelCapability,
  ProviderCredentialStatus,
  ProviderVerificationMetadata,
} from "@ai-assist/contracts";
import type { AitunnelModel } from "@ai-assist/provider-aitunnel";

import { getInfrastructure } from "../utils/infrastructure";

export type ProviderCredentialRecord = {
  id: string;
  projectId: string;
  provider: string;
  ciphertext: string;
  nonce: string;
  authTag: string;
  keyVersion: number;
  maskedHint: string;
  status: ProviderCredentialStatus;
  lastVerifiedAt: Date | null;
  lastErrorCode: string | null;
  verificationMetadata: ProviderVerificationMetadata | null;
  updatedAt: Date;
};

export const findProviderCredential = async (
  projectId: string,
): Promise<ProviderCredentialRecord | null> => {
  const result = await getInfrastructure()
    .database.db.select()
    .from(providerCredentials)
    .where(
      and(
        eq(providerCredentials.projectId, projectId),
        eq(providerCredentials.provider, "aitunnel"),
      ),
    )
    .limit(1);

  const credential = result[0];
  if (!credential) return null;
  return {
    ...credential,
    verificationMetadata: credential.verificationMetadata as ProviderVerificationMetadata | null,
  };
};

export const upsertProviderCredential = async (input: {
  id: string;
  projectId: string;
  ciphertext: string;
  nonce: string;
  authTag: string;
  keyVersion: number;
  maskedHint: string;
  verifiedAt: Date;
  verificationMetadata: ProviderVerificationMetadata;
}): Promise<void> => {
  await getInfrastructure()
    .database.db.insert(providerCredentials)
    .values({
      id: input.id,
      projectId: input.projectId,
      provider: "aitunnel",
      ciphertext: input.ciphertext,
      nonce: input.nonce,
      authTag: input.authTag,
      keyVersion: input.keyVersion,
      maskedHint: input.maskedHint,
      status: "verified",
      lastVerifiedAt: input.verifiedAt,
      lastErrorCode: null,
      verificationMetadata: input.verificationMetadata,
    })
    .onConflictDoUpdate({
      target: [providerCredentials.projectId, providerCredentials.provider],
      set: {
        ciphertext: input.ciphertext,
        nonce: input.nonce,
        authTag: input.authTag,
        keyVersion: input.keyVersion,
        maskedHint: input.maskedHint,
        status: "verified",
        lastVerifiedAt: input.verifiedAt,
        lastErrorCode: null,
        verificationMetadata: input.verificationMetadata,
        updatedAt: input.verifiedAt,
      },
    });
};

export const updateProviderCredentialVerification = async (input: {
  credentialId: string;
  status: ProviderCredentialStatus;
  verifiedAt: Date | null;
  errorCode: string | null;
  verificationMetadata?: ProviderVerificationMetadata;
}): Promise<void> => {
  await getInfrastructure()
    .database.db.update(providerCredentials)
    .set({
      status: input.status,
      lastVerifiedAt: input.verifiedAt,
      lastErrorCode: input.errorCode,
      ...(input.verificationMetadata ? { verificationMetadata: input.verificationMetadata } : {}),
      updatedAt: new Date(),
    })
    .where(eq(providerCredentials.id, input.credentialId));
};

export const deleteProviderCredential = async (credentialId: string): Promise<void> => {
  await getInfrastructure()
    .database.db.delete(providerCredentials)
    .where(eq(providerCredentials.id, credentialId));
};

export const replaceProviderModelCatalog = async (
  catalog: Record<ModelCapability, AitunnelModel[]>,
  fetchedAt: Date,
): Promise<void> => {
  await getInfrastructure().database.db.transaction(async (transaction) => {
    for (const capability of ["chat", "embeddings", "rerank"] as const) {
      await transaction
        .update(providerModelCatalog)
        .set({ available: false })
        .where(
          and(
            eq(providerModelCatalog.provider, "aitunnel"),
            eq(providerModelCatalog.capability, capability),
          ),
        );

      for (const model of catalog[capability]) {
        const values = {
          provider: "aitunnel",
          modelId: model.id,
          capability,
          upstreamProvider: model.upstreamProvider,
          description: model.description,
          inputModalities: model.inputModalities,
          outputModalities: model.outputModalities,
          contextSize: model.contextSize,
          maxOutput: model.maxOutput,
          maxTokens: model.maxTokens,
          pricing: model.pricing,
          available: true,
          providerCreatedAt: model.createdAt,
          fetchedAt,
          rawChecksum: model.rawChecksum,
        };
        await transaction
          .insert(providerModelCatalog)
          .values(values)
          .onConflictDoUpdate({
            target: [
              providerModelCatalog.provider,
              providerModelCatalog.modelId,
              providerModelCatalog.capability,
            ],
            set: values,
          });
      }
    }
  });
};

export const listProviderModels = async (capability?: ModelCapability) => {
  const condition = capability
    ? and(
        eq(providerModelCatalog.provider, "aitunnel"),
        eq(providerModelCatalog.capability, capability),
      )
    : eq(providerModelCatalog.provider, "aitunnel");

  return getInfrastructure()
    .database.db.select()
    .from(providerModelCatalog)
    .where(condition)
    .orderBy(providerModelCatalog.capability, providerModelCatalog.modelId);
};

export const findProviderModel = async (modelId: string, capability: ModelCapability) => {
  const result = await getInfrastructure()
    .database.db.select()
    .from(providerModelCatalog)
    .where(
      and(
        eq(providerModelCatalog.provider, "aitunnel"),
        eq(providerModelCatalog.modelId, modelId),
        eq(providerModelCatalog.capability, capability),
      ),
    )
    .limit(1);

  return result[0] ?? null;
};

export const findProjectModelSettings = async (projectId: string) => {
  const result = await getInfrastructure()
    .database.db.select()
    .from(projectModelSettings)
    .where(eq(projectModelSettings.projectId, projectId))
    .limit(1);
  return result[0] ?? null;
};

export const upsertProjectModelSettings = async (input: {
  projectId: string;
  chatModelId: string | null;
  embeddingModelId: string | null;
  embeddingDimension: number | null;
  rerankModelId: string | null;
  maxOutputTokens: number;
  temperature: number | null;
  updatedBy: string;
}): Promise<void> => {
  const now = new Date();
  await getInfrastructure()
    .database.db.insert(projectModelSettings)
    .values({ ...input, updatedAt: now })
    .onConflictDoUpdate({
      target: projectModelSettings.projectId,
      set: {
        chatModelId: input.chatModelId,
        embeddingModelId: input.embeddingModelId,
        embeddingDimension: input.embeddingDimension,
        rerankModelId: input.rerankModelId,
        maxOutputTokens: input.maxOutputTokens,
        temperature: input.temperature,
        updatedBy: input.updatedBy,
        updatedAt: now,
      },
    });
};
