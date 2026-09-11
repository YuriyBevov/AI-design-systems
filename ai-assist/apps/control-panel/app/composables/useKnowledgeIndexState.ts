import type { KnowledgeIndexStateResponse } from "@ai-assist/contracts";

import { requiresKnowledgeModelReindex } from "~/utils/knowledge-index";

export const useKnowledgeIndexState = () => {
  const states = useState<Record<string, KnowledgeIndexStateResponse>>(
    "knowledge-index-states",
    () => ({}),
  );
  const pendingReindex = useState<Record<string, boolean>>(
    "knowledge-index-pending-reindex",
    () => ({}),
  );

  const setKnowledgeIndexState = (projectId: string, state: KnowledgeIndexStateResponse): void => {
    states.value = { ...states.value, [projectId]: state };
    if (!requiresKnowledgeModelReindex(state) && pendingReindex.value[projectId]) {
      pendingReindex.value = { ...pendingReindex.value, [projectId]: false };
    }
  };

  const markKnowledgeReindexRequired = (projectId: string): void => {
    pendingReindex.value = { ...pendingReindex.value, [projectId]: true };
  };

  return {
    states,
    pendingReindex,
    setKnowledgeIndexState,
    markKnowledgeReindexRequired,
  };
};
