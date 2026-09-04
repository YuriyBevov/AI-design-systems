import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const algorithm = "aes-256-gcm";
const nonceBytes = 12;
const authTagBytes = 16;

export type CredentialEnvelope = {
  ciphertext: string;
  nonce: string;
  authTag: string;
  keyVersion: number;
};

export const decodeCredentialMasterKey = (encoded: string): Buffer => {
  const key = Buffer.from(encoded, "base64");
  if (
    key.length !== 32 ||
    key.toString("base64").replace(/=+$/u, "") !== encoded.replace(/=+$/u, "")
  ) {
    key.fill(0);
    throw new Error("Credential encryption key must be a base64-encoded 32-byte value");
  }

  return key;
};

export const createCredentialKeyring = (input: {
  currentVersion: number;
  currentKey: string;
  previousKeysJson: string;
}): Map<number, Buffer> => {
  let previous: unknown;
  try {
    previous = JSON.parse(input.previousKeysJson);
  } catch {
    throw new Error("Previous credential encryption keys must be valid JSON");
  }
  if (!previous || Array.isArray(previous) || typeof previous !== "object") {
    throw new Error("Previous credential encryption keys must be a JSON object");
  }

  const keyring = new Map<number, Buffer>([
    [input.currentVersion, decodeCredentialMasterKey(input.currentKey)],
  ]);
  for (const [rawVersion, encoded] of Object.entries(previous)) {
    const version = Number(rawVersion);
    if (!Number.isInteger(version) || version < 1 || typeof encoded !== "string") {
      throw new Error("Previous credential encryption keys are malformed");
    }
    if (!keyring.has(version)) keyring.set(version, decodeCredentialMasterKey(encoded));
  }
  return keyring;
};

export const createCredentialAssociatedData = (input: {
  projectId: string;
  credentialId: string;
  provider: string;
}): string =>
  ["ai-assist", "credential", "v1", input.projectId, input.credentialId, input.provider].join(":");

export const encryptCredential = (input: {
  plaintext: string;
  associatedData: string;
  key: Uint8Array;
  keyVersion: number;
}): CredentialEnvelope => {
  if (input.key.byteLength !== 32) {
    throw new Error("Credential encryption key must contain 32 bytes");
  }

  const nonce = randomBytes(nonceBytes);
  const plaintext = Buffer.from(input.plaintext, "utf8");
  const cipher = createCipheriv(algorithm, input.key, nonce, { authTagLength: authTagBytes });
  cipher.setAAD(Buffer.from(input.associatedData, "utf8"));

  try {
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    return {
      ciphertext: ciphertext.toString("base64"),
      nonce: nonce.toString("base64"),
      authTag: cipher.getAuthTag().toString("base64"),
      keyVersion: input.keyVersion,
    };
  } finally {
    plaintext.fill(0);
  }
};

export const decryptCredential = (input: {
  envelope: CredentialEnvelope;
  associatedData: string;
  key: Uint8Array;
}): string => {
  if (input.key.byteLength !== 32) {
    throw new Error("Credential encryption key must contain 32 bytes");
  }

  const nonce = Buffer.from(input.envelope.nonce, "base64");
  const authTag = Buffer.from(input.envelope.authTag, "base64");
  const ciphertext = Buffer.from(input.envelope.ciphertext, "base64");

  if (nonce.length !== nonceBytes || authTag.length !== authTagBytes) {
    throw new Error("Credential envelope is malformed");
  }

  const decipher = createDecipheriv(algorithm, input.key, nonce, { authTagLength: authTagBytes });
  decipher.setAAD(Buffer.from(input.associatedData, "utf8"));
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

  try {
    return plaintext.toString("utf8");
  } finally {
    plaintext.fill(0);
  }
};

export const maskProviderKey = (value: string): string => {
  const normalized = value.trim();
  if (normalized.length < 12) {
    return "••••••••";
  }

  const prefix = normalized.startsWith("sk-aitunnel-") ? "sk-aitunnel-" : normalized.slice(0, 4);
  return `${prefix}…${normalized.slice(-4)}`;
};
