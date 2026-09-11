import { randomBytes, randomUUID } from "node:crypto";

import { afterAll, describe, expect, it } from "vitest";

import { createCredentialAssociatedData, encryptCredential } from "@ai-assist/domain";
import { createError, isError } from "h3";

import {
  decryptStoredProviderCredential,
  throwProviderHttpError,
} from "../server/services/provider";
import { closeInfrastructure } from "../server/utils/infrastructure";

afterAll(async () => {
  await closeInfrastructure();
});

describe("provider credential errors", () => {
  it("preserves a classified H3 credential error", () => {
    const source = createError({
      statusCode: 503,
      statusMessage: "Версия ключа шифрования недоступна",
      data: { code: "CREDENTIAL_KEY_VERSION_UNAVAILABLE", retryable: false },
    });

    let received: unknown;
    try {
      throwProviderHttpError(source);
    } catch (error) {
      received = error;
    }

    expect(received).toBe(source);
  });

  it("classifies an envelope that cannot be decrypted by the configured key", () => {
    const projectId = randomUUID();
    const credentialId = randomUUID();
    const provider = "aitunnel";
    const envelope = encryptCredential({
      plaintext: "sk-aitunnel-synthetic-test-key",
      associatedData: createCredentialAssociatedData({ projectId, credentialId, provider }),
      key: randomBytes(32),
      keyVersion: 1,
    });

    let received: unknown;
    try {
      decryptStoredProviderCredential({
        id: credentialId,
        projectId,
        provider,
        ...envelope,
        maskedHint: "sk-aitunnel-…-key",
        status: "verified",
        lastVerifiedAt: null,
        lastErrorCode: null,
        verificationMetadata: null,
        updatedAt: new Date(),
      });
    } catch (error) {
      received = error;
    }

    expect(isError(received)).toBe(true);
    if (isError<{ code?: string }>(received)) {
      expect(received.statusCode).toBe(503);
      expect(received.data?.code).toBe("CREDENTIAL_DECRYPTION_FAILED");
    }
  });
});
