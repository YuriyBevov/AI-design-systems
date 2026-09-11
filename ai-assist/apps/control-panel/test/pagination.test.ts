import { describe, expect, it } from "vitest";

import { getPaginationItems } from "../app/utils/pagination";

describe("getPaginationItems", () => {
  it("shows every page when there are no more than seven", () => {
    expect(getPaginationItems(1, 1)).toEqual([1]);
    expect(getPaginationItems(4, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("collapses pages after the beginning", () => {
    expect(getPaginationItems(1, 12)).toEqual([1, 2, 3, 4, 5, "ellipsis", 12]);
    expect(getPaginationItems(4, 12)).toEqual([1, 2, 3, 4, 5, "ellipsis", 12]);
  });

  it("keeps the current page between two ellipses", () => {
    expect(getPaginationItems(6, 12)).toEqual([1, "ellipsis", 5, 6, 7, "ellipsis", 12]);
  });

  it("collapses pages before the end", () => {
    expect(getPaginationItems(10, 12)).toEqual([1, "ellipsis", 8, 9, 10, 11, 12]);
    expect(getPaginationItems(12, 12)).toEqual([1, "ellipsis", 8, 9, 10, 11, 12]);
  });
});
