import { describe, expect, it } from "vitest";

import { hashPassword, validatePassword, verifyPassword } from "../src/index.js";

describe("password hashing", () => {
  it("uses a salted Argon2id hash", async () => {
    const password = "local-test-password";
    const first = await hashPassword(password);
    const second = await hashPassword(password);

    expect(first).toMatch(/^\$argon2id\$/);
    expect(second).not.toBe(first);
    expect(await verifyPassword(first, password)).toBe(true);
    expect(await verifyPassword(first, "wrong-password-value")).toBe(false);
  });

  it("enforces bounded password length", () => {
    expect(validatePassword("too-short")).toBe(false);
    expect(validatePassword("long-enough-password")).toBe(true);
  });
});
