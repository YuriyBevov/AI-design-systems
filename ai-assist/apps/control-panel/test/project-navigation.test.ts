import { describe, expect, it } from "vitest";

import { getProjectSelectionPath } from "../app/utils/project-navigation";

describe("getProjectSelectionPath", () => {
  it("keeps global pages in place", () => {
    expect(getProjectSelectionPath("/", "project-new", "owner")).toBe("/");
    expect(getProjectSelectionPath("/projects", "project-new", "owner")).toBe("/projects");
  });

  it("opens the matching section for the selected project", () => {
    expect(
      getProjectSelectionPath("/projects/project-old/assistant", "project-new", "editor"),
    ).toBe("/projects/project-new/assistant");
    expect(
      getProjectSelectionPath("/projects/project-old/knowledge/sources", "project-new", "viewer"),
    ).toBe("/projects/project-new/knowledge/sources");
  });

  it("returns from detail pages to the selected project list", () => {
    expect(
      getProjectSelectionPath("/projects/project-old/prompts/prompt-1", "project-new", "owner"),
    ).toBe("/projects/project-new/prompts");
    expect(
      getProjectSelectionPath(
        "/projects/project-old/knowledge/documents/document-1",
        "project-new",
        "owner",
      ),
    ).toBe("/projects/project-new/knowledge/documents");
  });

  it("does not open owner-only provider settings for another role", () => {
    expect(getProjectSelectionPath("/projects/project-old/provider", "project-new", "viewer")).toBe(
      "/projects/project-new/settings",
    );
  });
});
