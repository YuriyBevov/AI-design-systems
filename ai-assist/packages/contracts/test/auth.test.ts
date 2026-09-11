import { describe, expect, it } from "vitest";

import {
  adminSessionResponseSchema,
  createProjectRequestSchema,
  createUserRequestSchema,
  loginRequestSchema,
  reauthenticateRequestSchema,
  reauthenticateResponseSchema,
  updateUserRequestSchema,
  updateProjectRequestSchema,
  updateProjectStatusRequestSchema,
} from "../src/index.js";

describe("admin contracts", () => {
  it("exposes a product account role in the session", () => {
    const session = adminSessionResponseSchema.parse({
      user: {
        id: "a868d3cc-c71b-4ae4-9706-930ddb2bfa67",
        name: "Администратор",
        email: "admin@example.test",
        role: "admin",
      },
      projects: [],
      expiresAt: "2026-09-09T12:00:00.000Z",
    });
    expect(session.user.role).toBe("admin");
  });

  it("normalizes an email without echoing password", () => {
    expect(
      loginRequestSchema.parse({ email: " Owner@Example.COM ", password: "password" }),
    ).toEqual({
      email: "owner@example.com",
      password: "password",
    });
  });

  it("accepts strict reauthentication payloads and responses", () => {
    expect(reauthenticateRequestSchema.parse({ password: "current-password" })).toEqual({
      password: "current-password",
    });
    expect(
      reauthenticateRequestSchema.safeParse({ password: "current-password", email: "x@y.test" })
        .success,
    ).toBe(false);
    expect(reauthenticateResponseSchema.parse({ status: "ok", validForMinutes: 30 })).toEqual({
      status: "ok",
      validForMinutes: 30,
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
      userIds: [],
    });
  });

  it("accepts only the two product roles for users", () => {
    const user = {
      name: "Анна",
      email: " ANNA@EXAMPLE.TEST ",
      password: "Temporary-Password-2026",
      role: "user",
      projectIds: ["a868d3cc-c71b-4ae4-9706-930ddb2bfa67"],
    };
    expect(createUserRequestSchema.parse(user)).toMatchObject({
      name: "Анна",
      email: "anna@example.test",
      role: "user",
    });
    expect(createUserRequestSchema.safeParse({ ...user, role: "owner" }).success).toBe(false);
    expect(updateUserRequestSchema.safeParse({ role: "admin" }).success).toBe(true);
    expect(updateUserRequestSchema.safeParse({ role: "viewer" }).success).toBe(false);
  });

  it("does not allow an empty user update or an invited status assignment", () => {
    expect(updateUserRequestSchema.safeParse({}).success).toBe(false);
    expect(updateUserRequestSchema.safeParse({ status: "invited" }).success).toBe(false);
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
