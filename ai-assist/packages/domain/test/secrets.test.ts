import { describe, expect, it } from "vitest";

import {
  createCredentialAssociatedData,
  createCredentialKeyring,
  decodeCredentialMasterKey,
  decryptCredential,
  encryptCredential,
  maskProviderKey,
} from "../src/index.js";

const encodedKey = Buffer.from("0123456789abcdef0123456789abcdef").toString("base64");
const associatedData = createCredentialAssociatedData({
  projectId: "00000000-0000-4000-8000-000000000001",
  credentialId: "00000000-0000-4000-8000-000000000002",
  provider: "aitunnel",
});

describe("credential envelopes", () => {
  it("round-trips with authenticated associated data", () => {
    const key = decodeCredentialMasterKey(encodedKey);
    const envelope = encryptCredential({
      plaintext: "sk-aitunnel-test-value-1234",
      associatedData,
      key,
      keyVersion: 7,
    });

    expect(decryptCredential({ envelope, associatedData, key })).toBe(
      "sk-aitunnel-test-value-1234",
    );
    key.fill(0);
  });

  it("uses a unique nonce for the same plaintext", () => {
    const key = decodeCredentialMasterKey(encodedKey);
    const first = encryptCredential({ plaintext: "same", associatedData, key, keyVersion: 1 });
    const second = encryptCredential({ plaintext: "same", associatedData, key, keyVersion: 1 });

    expect(first.nonce).not.toBe(second.nonce);
    expect(first.ciphertext).not.toBe(second.ciphertext);
    key.fill(0);
  });

  it("rejects another project as associated data", () => {
    const key = decodeCredentialMasterKey(encodedKey);
    const envelope = encryptCredential({ plaintext: "secret", associatedData, key, keyVersion: 1 });

    expect(() =>
      decryptCredential({ envelope, associatedData: `${associatedData}:other`, key }),
    ).toThrow();
    key.fill(0);
  });

  it("masks without exposing short values", () => {
    expect(maskProviderKey("short")).toBe("••••••••");
    expect(maskProviderKey("sk-aitunnel-example-secret-abcd")).toBe("sk-aitunnel-…abcd");
  });

  it("builds a versioned keyring without replacing the current key", () => {
    const previousKey = Buffer.from("abcdef0123456789abcdef0123456789").toString("base64");
    const keyring = createCredentialKeyring({
      currentVersion: 2,
      currentKey: encodedKey,
      previousKeysJson: JSON.stringify({ 1: previousKey, 2: previousKey }),
    });
    expect(keyring.get(2)?.toString("base64")).toBe(encodedKey);
    expect(keyring.get(1)?.toString("base64")).toBe(previousKey);
    for (const key of keyring.values()) key.fill(0);
  });
});
