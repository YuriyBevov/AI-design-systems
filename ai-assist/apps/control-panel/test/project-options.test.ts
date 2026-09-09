import { describe, expect, it } from "vitest";

import { russianTimezoneOptions } from "../app/utils/project-options";

describe("russianTimezoneOptions", () => {
  it("contains every current IANA zone1970 entry tagged for Russia", () => {
    expect(russianTimezoneOptions).toHaveLength(27);
    expect(new Set(russianTimezoneOptions.map(({ value }) => value)).size).toBe(27);
  });

  it("covers all eleven Russian UTC offsets", () => {
    const offsets = new Set(
      russianTimezoneOptions.map(({ label }) => label.match(/^UTC\+(\d{2}):00/u)?.[1]),
    );
    expect([...offsets]).toEqual([
      "02",
      "03",
      "04",
      "05",
      "06",
      "07",
      "08",
      "09",
      "10",
      "11",
      "12",
    ]);
  });

  it("uses timezone identifiers supported by the runtime", () => {
    for (const { value } of russianTimezoneOptions) {
      expect(() => new Intl.DateTimeFormat("ru-RU", { timeZone: value })).not.toThrow();
    }
  });
});
