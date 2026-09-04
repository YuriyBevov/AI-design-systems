import { describe, expect, it } from "vitest";

import { resolveWidgetUrl } from "../src/loader-core";

describe("widget loader", () => {
  it("loads the widget next to a versioned loader", () => {
    expect(resolveWidgetUrl("https://assist.example/widget/v1/loader.js")).toBe(
      "https://assist.example/widget/v1/widget.js",
    );
  });
});
