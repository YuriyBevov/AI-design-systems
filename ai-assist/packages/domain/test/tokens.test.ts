import { describe, expect, it } from "vitest";

import { createOpaqueToken, hashOpaqueToken, opaqueTokenMatches } from "../src/index.js";

describe("opaque tokens", () => {
  it("stores only a deterministic hash", () => {
    const token = createOpaqueToken();
    const hash = hashOpaqueToken(token);

    expect(token).not.toBe(hash);
    expect(hash).toHaveLength(64);
    expect(opaqueTokenMatches(token, hash)).toBe(true);
    expect(opaqueTokenMatches(`${token}x`, hash)).toBe(false);
  });
});
