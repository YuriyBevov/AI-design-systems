import { describe, expect, it } from "vitest";

import {
  getAssistantSettingsTab,
  isAssistantSettingsPath,
} from "../app/utils/assistant-settings-navigation";

describe("assistant settings navigation", () => {
  it("recognizes every route consolidated under assistant settings", () => {
    expect(isAssistantSettingsPath("/projects/project-1/assistant")).toBe(true);
    expect(isAssistantSettingsPath("/projects/project-1/prompts/prompt-1")).toBe(true);
    expect(isAssistantSettingsPath("/projects/project-1/knowledge/documents/document-1")).toBe(
      true,
    );
    expect(isAssistantSettingsPath("/projects/project-1/provider")).toBe(true);
    expect(isAssistantSettingsPath("/projects/project-1/components")).toBe(false);
  });

  it("resolves local assistant tabs from the query", () => {
    const path = "/projects/project-1/assistant";
    expect(getAssistantSettingsTab(path)).toBe("interface");
    expect(getAssistantSettingsTab(path, "interface")).toBe("interface");
    expect(getAssistantSettingsTab(path, "appearance")).toBe("interface");
    expect(getAssistantSettingsTab(path, "security")).toBe("security");
    expect(getAssistantSettingsTab(path, "unknown")).toBe("interface");
  });

  it("resolves nested route tabs independently of query params", () => {
    expect(getAssistantSettingsTab("/projects/project-1/prompts/prompt-1", "security")).toBe(
      "prompts",
    );
    expect(getAssistantSettingsTab("/projects/project-1/knowledge/sources")).toBe("knowledge");
    expect(getAssistantSettingsTab("/projects/project-1/provider")).toBe("integration");
  });
});
