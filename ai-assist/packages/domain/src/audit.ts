const sensitiveKeyPattern =
  /authorization|cookie|password|secret|token|credential|ciphertext|nonce|auth.?tag|api.?key/i;

export type SafeAuditValue =
  | null
  | boolean
  | number
  | string
  | SafeAuditValue[]
  | { [key: string]: SafeAuditValue };

export const redactAuditMetadata = (value: unknown, key = ""): SafeAuditValue => {
  if (sensitiveKeyPattern.test(key)) {
    return "[REDACTED]";
  }

  if (value === null || typeof value === "boolean" || typeof value === "number") {
    return value;
  }

  if (typeof value === "string") {
    return value.length > 500 ? `${value.slice(0, 500)}…` : value;
  }

  if (Array.isArray(value)) {
    return value.slice(0, 50).map((item) => redactAuditMetadata(item));
  }

  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, 50)
        .map(([childKey, childValue]) => [
          childKey,
          redactAuditMetadata(childValue, childKey),
        ]),
    );
  }

  return String(value);
};
