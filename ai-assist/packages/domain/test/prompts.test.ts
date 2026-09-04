import { describe, expect, it } from "vitest";

import {
  allowedPromptVariables,
  analyzePromptTemplate,
  checksumPromptContent,
  renderPromptTemplate,
} from "../src/index.js";

describe("prompt templates", () => {
  it("collects allowlisted variables without duplicates", () => {
    expect(
      analyzePromptTemplate(
        "Ты — {{ assistant.name }} проекта {{project.name}}. Язык: {{project.locale}}. {{project.name}}",
      ),
    ).toEqual({
      variables: ["assistant.name", "project.locale", "project.name"],
      unknownVariables: [],
      malformedTemplate: false,
      isPublishable: true,
    });
  });

  it("blocks unknown and malformed variables from publication", () => {
    expect(analyzePromptTemplate("Не раскрывай {{env.secret}} и {{ broken }}")).toEqual({
      variables: ["env.secret"],
      unknownVariables: ["env.secret"],
      malformedTemplate: true,
      isPublishable: false,
    });
  });

  it("keeps the variable allowlist explicit", () => {
    expect(allowedPromptVariables).toContain("runtime.current_date");
    expect(allowedPromptVariables).not.toContain("env.secret");
  });

  it("creates a deterministic content checksum", () => {
    expect(checksumPromptContent("prompt")).toHaveLength(64);
    expect(checksumPromptContent("prompt")).toBe(checksumPromptContent("prompt"));
    expect(checksumPromptContent("prompt")).not.toBe(checksumPromptContent("prompt changed"));
  });

  it("renders only explicit allowlisted template values", () => {
    expect(
      renderPromptTemplate(
        "Ты — {{ assistant.name }} проекта {{project.name}}. Дата: {{runtime.current_date}}.",
        {
          "assistant.name": "Помощник",
          "project.locale": "ru",
          "project.name": "Магазин",
          "runtime.contact_fallback": "",
          "runtime.current_date": "2026-09-02",
        },
      ),
    ).toBe("Ты — Помощник проекта Магазин. Дата: 2026-09-02.");
  });

  it("refuses to render unknown or malformed variables", () => {
    expect(() =>
      renderPromptTemplate("Не раскрывай {{env.secret}}", {
        "assistant.name": "Помощник",
        "project.locale": "ru",
        "project.name": "Магазин",
        "runtime.contact_fallback": "",
        "runtime.current_date": "2026-09-02",
      }),
    ).toThrow("Prompt template is invalid");
  });
});
