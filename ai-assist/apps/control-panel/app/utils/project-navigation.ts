export type ProjectNavigationRole = "owner" | "editor" | "viewer";

export const getProjectSelectionPath = (
  currentPath: string,
  projectId: string,
  role: ProjectNavigationRole,
): string => {
  if (currentPath === "/" || currentPath === "/projects") return currentPath;

  const projectPath = `/projects/${projectId}`;
  const scopedPath = currentPath.match(/^\/projects\/[^/]+\/(.+)$/)?.[1];
  if (!scopedPath) return projectPath + "/settings";

  if (scopedPath === "settings") return projectPath + "/settings";
  if (scopedPath === "assistant") return projectPath + "/assistant";
  if (scopedPath.startsWith("prompts")) return projectPath + "/prompts";
  if (scopedPath.startsWith("knowledge/documents")) {
    return projectPath + "/knowledge/documents";
  }
  if (scopedPath.startsWith("knowledge/sources")) return projectPath + "/knowledge/sources";
  if (scopedPath === "components") return projectPath + "/components";
  if (scopedPath === "provider") {
    return role === "owner" ? projectPath + "/provider" : projectPath + "/settings";
  }
  if (scopedPath === "audit") return projectPath + "/audit";

  return projectPath + "/settings";
};
