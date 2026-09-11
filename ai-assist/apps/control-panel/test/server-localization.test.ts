import { readdirSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const collectTypeScriptFiles = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return collectTypeScriptFiles(path);
    return entry.isFile() && entry.name.endsWith(".ts") ? [path] : [];
  });

describe("server response localization", () => {
  it("keeps every literal statusMessage in Russian", () => {
    const serverRoot = fileURLToPath(new URL("../server", import.meta.url));
    const untranslated: string[] = [];

    for (const file of collectTypeScriptFiles(serverRoot)) {
      const source = readFileSync(file, "utf8");
      const messages = source.matchAll(/statusMessage:\s*(["'`])([^"'`]+)\1/gu);
      for (const match of messages) {
        if (!/[А-Яа-яЁё]/u.test(match[2] ?? "")) {
          untranslated.push(`${relative(serverRoot, file)}: ${match[2]}`);
        }
      }
    }

    expect(untranslated).toEqual([]);
  });

  it("keeps custom contract validation messages in Russian", () => {
    const contractsRoot = fileURLToPath(
      new URL("../../../packages/contracts/src", import.meta.url),
    );
    const untranslated: string[] = [];

    for (const file of collectTypeScriptFiles(contractsRoot)) {
      const source = readFileSync(file, "utf8");
      const messages = source.matchAll(/\bmessage:\s*(["'`])([^"'`]+)\1/gu);
      for (const match of messages) {
        if (!/[А-Яа-яЁё]/u.test(match[2] ?? "")) {
          untranslated.push(`${relative(contractsRoot, file)}: ${match[2]}`);
        }
      }
    }

    expect(untranslated).toEqual([]);
  });
});
