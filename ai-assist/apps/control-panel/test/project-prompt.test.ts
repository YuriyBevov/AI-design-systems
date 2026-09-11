import type { PromptListResponse } from "@ai-assist/contracts";
import { describe, expect, it } from "vitest";

import { getProjectPromptId } from "../app/utils/project-prompt";

const prompt = (
  id: string,
  status: PromptListResponse["prompts"][number]["status"],
): PromptListResponse["prompts"][number] =>
  ({ id, status }) as PromptListResponse["prompts"][number];

describe("getProjectPromptId", () => {
  it("prefers the role used by the active publication", () => {
    const promptList = {
      prompts: [prompt("draft-role", "draft"), prompt("current-role", "published")],
      activePublication: { promptId: "current-role" },
    } as PromptListResponse;

    expect(getProjectPromptId(promptList)).toBe("current-role");
  });

  it("uses the latest non-archived role when the project has no publication", () => {
    const promptList = {
      prompts: [prompt("archived-role", "archived"), prompt("draft-role", "draft")],
      activePublication: null,
    } as PromptListResponse;

    expect(getProjectPromptId(promptList)).toBe("draft-role");
  });

  it("returns null when only archived roles remain", () => {
    const promptList = {
      prompts: [prompt("archived-role", "archived")],
      activePublication: null,
    } as PromptListResponse;

    expect(getProjectPromptId(promptList)).toBeNull();
  });
});
