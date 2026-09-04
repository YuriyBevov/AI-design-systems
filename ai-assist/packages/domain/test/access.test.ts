import { describe, expect, it } from "vitest";

import { canProjectRole, createProjectScope } from "../src/index.js";

describe("project role policy", () => {
  it.each([
    ["viewer", "viewer", true],
    ["viewer", "editor", false],
    ["viewer", "owner", false],
    ["editor", "viewer", true],
    ["editor", "editor", true],
    ["editor", "owner", false],
    ["owner", "viewer", true],
    ["owner", "editor", true],
    ["owner", "owner", true],
  ] as const)("checks %s against %s", (actual, required, expected) => {
    expect(canProjectRole(actual, required)).toBe(expected);
  });

  it("creates an immutable scope only from verified fields", () => {
    const scope = createProjectScope({ projectId: "project", userId: "user", role: "owner" });
    expect(Object.isFrozen(scope)).toBe(true);
  });
});
