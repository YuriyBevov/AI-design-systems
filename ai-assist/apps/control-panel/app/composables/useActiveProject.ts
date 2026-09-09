import type { AdminSessionResponse } from "@ai-assist/contracts";

import { getProjectSelectionPath } from "~/utils/project-navigation";

type SessionProject = AdminSessionResponse["projects"][number];

export const useActiveProject = () => {
  const session = useAdminSessionState();
  const route = useRoute();
  const storedProjectCookie = useCookie<string | null>("ai_assist_active_project", {
    sameSite: "lax",
    default: () => null,
  });
  const activeProjectId = useState<string | null>(
    "active-project-id",
    () => storedProjectCookie.value,
  );

  const routeProjectId = computed(() =>
    typeof route.params.projectId === "string" ? route.params.projectId : null,
  );
  const activeProject = computed<SessionProject | undefined>(() => {
    const projects = session.value?.projects ?? [];
    return (
      projects.find((project) => project.id === routeProjectId.value) ??
      projects.find((project) => project.id === activeProjectId.value) ??
      projects[0]
    );
  });

  watch(
    activeProject,
    (project) => {
      activeProjectId.value = project?.id ?? null;
      storedProjectCookie.value = activeProjectId.value;
    },
    { immediate: true },
  );

  const selectProject = async (projectId: string): Promise<void> => {
    const project = session.value?.projects.find((candidate) => candidate.id === projectId);
    if (!project) return;

    activeProjectId.value = project.id;
    storedProjectCookie.value = project.id;
    const targetPath = getProjectSelectionPath(route.path, project.id, project.role);
    if (targetPath !== route.path) await navigateTo(targetPath);
  };

  return {
    activeProject,
    selectProject,
  };
};
