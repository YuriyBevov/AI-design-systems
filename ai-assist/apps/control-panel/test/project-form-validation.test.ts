import { describe, expect, it } from "vitest";

import { validateProjectRequiredFields } from "../app/utils/project-form-validation";

describe("project form validation", () => {
  it("requires a non-empty project name", () => {
    expect(validateProjectRequiredFields({ name: "   ", timezone: "Europe/Moscow" })).toEqual({
      name: "Укажите название проекта.",
      timezone: "",
    });
  });

  it("requires a timezone from the supported list", () => {
    expect(validateProjectRequiredFields({ name: "Проект", timezone: "" })).toEqual({
      name: "",
      timezone: "Выберите часовой пояс.",
    });
  });

  it("accepts valid required fields", () => {
    expect(validateProjectRequiredFields({ name: "Проект", timezone: "Asia/Vladivostok" })).toEqual(
      { name: "", timezone: "" },
    );
  });
});
