type KnowledgeModelIndexState = {
  configuredEmbeddingModelId: string | null;
  active: { embeddingModelId: string } | null;
};

export const requiresKnowledgeModelReindex = (
  state: KnowledgeModelIndexState | null | undefined,
): boolean => {
  if (!state?.configuredEmbeddingModelId) return false;
  return !state.active || state.active.embeddingModelId !== state.configuredEmbeddingModelId;
};
