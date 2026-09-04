import { describe, expect, it } from "vitest";

import {
  emptyQualificationState,
  formatQualificationState,
  updateQualificationState,
} from "../src/index.js";

describe("box qualification state", () => {
  it("retains dimensions and later quantity across turns", () => {
    const dimensions = updateQualificationState(
      emptyQualificationState(),
      "Нужна коробка 40×30×25 см",
    );
    const completed = updateQualificationState(dimensions, "Количество — 120 штук");

    expect(completed.dimensions).toEqual({ lengthMm: 400, widthMm: 300, heightMm: 250 });
    expect(completed.quantity).toBe(120);
    expect(formatQualificationState(completed)).toContain("400×300×250 мм");
  });

  it("recognizes material and printing constraints without erasing earlier values", () => {
    const state = updateQualificationState(
      updateQualificationState(emptyQualificationState(), "Нужен пятислойный короб"),
      "Без печати логотипа",
    );

    expect(state.material).toBe("пятислойный гофрокартон");
    expect(state.printingRequired).toBe(false);
  });

  it("recognizes a natural negative printing phrase", () => {
    expect(updateQualificationState(emptyQualificationState(), "Печать не нужна")).toMatchObject({
      printingRequired: false,
    });
  });

  it("ignores implausible dimensions and quantities", () => {
    expect(
      updateQualificationState(emptyQualificationState(), "100001×20×20 мм и 10000001 коробок"),
    ).toEqual(emptyQualificationState());
  });
});
