import { createHash } from "node:crypto";

export const allowedPromptVariables = [
  "assistant.name",
  "project.locale",
  "project.name",
  "runtime.contact_fallback",
  "runtime.current_date",
] as const;

const allowedPromptVariableSet = new Set<string>(allowedPromptVariables);
const promptVariablePattern = /\{\{\s*([a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+)\s*\}\}/gu;

export type PromptTemplateAnalysis = {
  variables: string[];
  unknownVariables: string[];
  malformedTemplate: boolean;
  isPublishable: boolean;
};

export type PromptTemplateValues = Record<(typeof allowedPromptVariables)[number], string>;

export const analyzePromptTemplate = (content: string): PromptTemplateAnalysis => {
  const variables = new Set<string>();
  const contentWithoutVariables = content.replace(
    promptVariablePattern,
    (_match, variable: string) => {
      variables.add(variable);
      return "";
    },
  );
  const sortedVariables = [...variables].sort();
  const unknownVariables = sortedVariables.filter(
    (variable) => !allowedPromptVariableSet.has(variable),
  );
  const malformedTemplate =
    contentWithoutVariables.includes("{{") || contentWithoutVariables.includes("}}");

  return {
    variables: sortedVariables,
    unknownVariables,
    malformedTemplate,
    isPublishable: unknownVariables.length === 0 && !malformedTemplate,
  };
};

export const checksumPromptContent = (content: string): string =>
  createHash("sha256").update(content, "utf8").digest("hex");

export const renderPromptTemplate = (content: string, values: PromptTemplateValues): string => {
  const analysis = analyzePromptTemplate(content);
  if (!analysis.isPublishable) throw new Error("Prompt template is invalid");

  return content.replace(promptVariablePattern, (_match, variable: string) => {
    const value = values[variable as keyof PromptTemplateValues];
    if (value === undefined) throw new Error("Prompt template value is missing");
    return value;
  });
};
