import { describe, expect, it } from "vitest";

import { getPromptRevisionMarker, promptContentDiffers } from "../app/utils/prompt-versions";

describe("prompt version presentation", () => {
  it("marks the active revision as current", () => {
    expect(getPromptRevisionMarker(3, 3)).toBe("Текущий");
  });

  it("marks every non-current revision as draft", () => {
    expect(getPromptRevisionMarker(4, 3)).toBe("Черновик");
    expect(getPromptRevisionMarker(2, 3)).toBe("Черновик");
    expect(getPromptRevisionMarker(1, null)).toBe("Черновик");
  });

  it("detects whether editor content differs from a saved revision", () => {
    expect(promptContentDiffers("Новый текст", "Старый текст")).toBe(true);
    expect(promptContentDiffers("Текст", "Текст")).toBe(false);
  });
});
