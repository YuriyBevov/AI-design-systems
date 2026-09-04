import { describe, expect, it } from "vitest";

import { redactAuditMetadata } from "../src/index.js";

describe("audit metadata redaction", () => {
  it("redacts sensitive values recursively", () => {
    expect(
      redactAuditMetadata({
        changed: ["name"],
        password: "must-not-appear",
        nested: { authorizationHeader: "must-not-appear" },
      }),
    ).toEqual({
      changed: ["name"],
      password: "[REDACTED]",
      nested: { authorizationHeader: "[REDACTED]" },
    });
  });
});
