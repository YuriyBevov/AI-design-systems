import { describe, expect, it } from "vitest";

import {
  createProjectRequestSchema,
  loginRequestSchema,
  updateProjectRequestSchema,
  updateProjectStatusRequestSchema,
} from "../src/index.js";

describe("admin contracts", () => {
  it("normalizes an email without echoing password", () => {
    expect(
      loginRequestSchema.parse({ email: " Owner@Example.COM ", password: "password" }),
    ).toEqual({
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

    expect(
      updateProjectRequestSchema.safeParse({ name: "Project", status: "archived" }).success,
    ).toBe(false);
  });

  it("accepts project creation with an optional template", () => {
    expect(
      createProjectRequestSchema.parse({
        name: "Новый проект",
        templateProjectId: "a868d3cc-c71b-4ae4-9706-930ddb2bfa67",
      }),
    ).toEqual({
      name: "Новый проект",
      timezone: "Europe/Moscow",
      templateProjectId: "a868d3cc-c71b-4ae4-9706-930ddb2bfa67",
    });
  });

  it("keeps generated and single-locale project fields out of creation input", () => {
    for (const field of [
      { slug: "new-project" },
      { defaultLocale: "en" },
      { conversationRetentionDays: 90 },
    ]) {
      expect(createProjectRequestSchema.safeParse({ name: "Проект", ...field }).success).toBe(
        false,
      );
    }
  });

  it("allows pause and resume but not archive through status update", () => {
    expect(updateProjectStatusRequestSchema.safeParse({ status: "suspended" }).success).toBe(true);
    expect(updateProjectStatusRequestSchema.safeParse({ status: "active" }).success).toBe(true);
    expect(updateProjectStatusRequestSchema.safeParse({ status: "archived" }).success).toBe(false);
  });
});
