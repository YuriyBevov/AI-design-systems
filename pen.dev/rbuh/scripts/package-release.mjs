import { createHash } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const projectDir = fileURLToPath(new URL("../", import.meta.url));
const releaseDir = new URL("../release/", import.meta.url);
const archiveName = "rbuh-server.tar.gz";
const archivePath = fileURLToPath(new URL(archiveName, releaseDir));
const entries = ["dist", "package.json", "package-lock.json", ".env.example", ".nvmrc", "DEPLOY.md"];

await access(new URL("../dist/server/entry.mjs", import.meta.url));
await access(new URL("../dist/client/", import.meta.url));
await mkdir(releaseDir, { recursive: true });

// Explicit allowlist: no source photos, local dependencies, credentials or Git metadata.
const result = spawnSync("tar", [
  "-czf", archivePath,
  "--exclude=.DS_Store", "--exclude=._*",
  "-C", projectDir,
  ...entries,
], {
  stdio: "inherit",
  env: { ...process.env, COPYFILE_DISABLE: "1" },
});

if (result.error) throw result.error;
if (result.status !== 0) throw new Error(`Release packaging failed (${result.status}).`);

const archive = await readFile(archivePath);
const checksum = createHash("sha256").update(archive).digest("hex");
await writeFile(new URL(`${archiveName}.sha256`, releaseDir), `${checksum}  ${archiveName}\n`);
console.log(`Server archive: ${archivePath} (${(archive.length / 1024 / 1024).toFixed(2)} MiB)`);
console.log(`SHA-256: ${checksum}`);
