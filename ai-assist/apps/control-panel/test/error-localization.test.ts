import { describe, expect, it } from "vitest";

import { getRussianServerErrorMessage } from "../server/utils/error-localization";

describe("server error localization", () => {
  it("preserves an explicit Russian status message", () => {
    expect(
      getRussianServerErrorMessage({ statusCode: 422, statusMessage: "Выберите модель" }),
    ).toBe("Выберите модель");
  });

  it("replaces a framework error with a Russian status fallback", () => {
    expect(getRussianServerErrorMessage({ statusCode: 404, statusMessage: "Not Found" })).toBe(
      "Запрошенные данные не найдены",
    );
  });

  it("does not expose an English unhandled error", () => {
    expect(getRussianServerErrorMessage({ statusCode: 500, message: "Database failed" })).toBe(
      "Не удалось выполнить запрос из-за ошибки сервера",
    );
  });
});
