import { readdirSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const collectVueFiles = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return collectVueFiles(path);
    return entry.isFile() && entry.name.endsWith(".vue") ? [path] : [];
  });

describe("custom form validation", () => {
  it("disables browser validation pop-ups for every application form", () => {
    const controlPanelRoot = fileURLToPath(new URL("../app", import.meta.url));
    const widgetRoot = fileURLToPath(new URL("../../widget/src", import.meta.url));
    const files = [...collectVueFiles(controlPanelRoot), ...collectVueFiles(widgetRoot)];
    const missingNoValidate: string[] = [];
    let formCount = 0;

    for (const file of files) {
      const source = readFileSync(file, "utf8");
      const forms = source.match(/<form\b[\s\S]*?>/gu) ?? [];
      formCount += forms.length;
      if (forms.some((form) => !/\snovalidate(?:\s|>)/u.test(form))) {
        missingNoValidate.push(relative(resolve(controlPanelRoot, "../.."), file));
      }
    }

    expect(formCount).toBeGreaterThan(0);
    expect(missingNoValidate).toEqual([]);
  });
});
