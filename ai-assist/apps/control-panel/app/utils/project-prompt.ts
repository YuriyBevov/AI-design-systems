import type { PromptListResponse } from "@ai-assist/contracts";

export const getProjectPromptId = (promptList: PromptListResponse): string | null => {
  const publishedPromptId = promptList.activePublication?.promptId;
  if (
    publishedPromptId &&
    promptList.prompts.some(
      (prompt) => prompt.id === publishedPromptId && prompt.status !== "archived",
    )
  ) {
    return publishedPromptId;
  }

  return promptList.prompts.find((prompt) => prompt.status !== "archived")?.id ?? null;
};
