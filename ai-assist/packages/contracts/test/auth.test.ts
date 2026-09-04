import { describe, expect, it } from "vitest";

import { loginRequestSchema, updateProjectRequestSchema } from "../src/index.js";

describe("admin contracts", () => {
  it("normalizes an email without echoing password", () => {
    expect(loginRequestSchema.parse({ email: " Owner@Example.COM ", password: "password" })).toEqual({
      email: "owner@example.com",
      password: "password",
    });
  });

  it("rejects an empty project update", () => {
    expect(updateProjectRequestSchema.safeParse({}).success).toBe(false);
  });

  it("rejects unknown state-changing fields", () => {
    expect(
      loginRequestSchema.safeParse({
        email: "owner@example.test",
        password: "secret",
        role: "owner",
      }).success,
    ).toBe(false);

    expect(updateProjectRequestSchema.safeParse({ name: "Project", status: "archived" }).success).toBe(
      false,
    );
  });
});
