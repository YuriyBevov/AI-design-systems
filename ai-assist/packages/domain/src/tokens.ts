import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const createOpaqueToken = (): string => randomBytes(32).toString("base64url");

export const hashOpaqueToken = (token: string): string =>
  createHash("sha256").update(token, "utf8").digest("hex");

export const opaqueTokenMatches = (token: string, expectedHash: string): boolean => {
  const actual = Buffer.from(hashOpaqueToken(token), "hex");
  const expected = Buffer.from(expectedHash, "hex");

  return actual.length === expected.length && timingSafeEqual(actual, expected);
};
