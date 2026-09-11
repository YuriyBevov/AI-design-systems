export type AssistantSettingsTab =
  "interface" | "security" | "prompts" | "knowledge" | "integration";

export const isAssistantSettingsPath = (path: string): boolean =>
  /^\/projects\/[^/]+\/(?:assistant|prompts|knowledge|provider)(?:\/|$)/u.test(path);

export const getAssistantSettingsTab = (
  path: string,
  queryTab?: string | (string | null)[] | null,
): AssistantSettingsTab => {
  if (path.includes("/prompts")) return "prompts";
  if (path.includes("/knowledge")) return "knowledge";
  if (path.includes("/provider")) return "integration";

  const normalizedQueryTab = Array.isArray(queryTab) ? queryTab[0] : queryTab;
  if (normalizedQueryTab === "security") return "security";
  if (normalizedQueryTab === "appearance") return "interface";
  return "interface";
};
