import { Buffer } from "node:buffer";
import { randomBytes } from "node:crypto";
import { chmod, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const environmentPath = fileURLToPath(new URL("../.env", import.meta.url));
const knownDevelopmentKey = "bG9jYWwtZGV2ZWxvcG1lbnQtZW5jcnlwdGlvbi1rZXk=";

const readEnvironmentFile = async () => {
  try {
    return await readFile(environmentPath, "utf8");
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return "";
    }
    throw error;
  }
};

const readValue = (source, name) => {
  const match = source.match(new RegExp(`^${name}=(.*)$`, "mu"));
  if (!match) return null;
  const value = match[1]?.trim() ?? "";
  if (
    value.length >= 2 &&
    ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'")))
  ) {
    return value.slice(1, -1);
  }
  return value;
};

const isBase64Key = (value) => {
  const decoded = Buffer.from(value, "base64");
  const valid =
    decoded.length === 32 &&
    decoded.toString("base64").replace(/=+$/u, "") === value.replace(/=+$/u, "");
  decoded.fill(0);
  return valid;
};

const source = await readEnvironmentFile();
const existingKey = readValue(source, "CREDENTIAL_ENCRYPTION_KEY");

if (existingKey) {
  if (existingKey === knownDevelopmentKey || !isBase64Key(existingKey)) {
    throw new Error(
      "CREDENTIAL_ENCRYPTION_KEY in .env must be an independent base64-encoded 32-byte key",
    );
  }
  console.log("Local credential master key is already configured in the ignored .env file");
  process.exit(0);
}

const configuredVersion = readValue(source, "CREDENTIAL_ENCRYPTION_KEY_VERSION");
const requestedVersion =
  configuredVersion ?? process.env.AI_ASSIST_LOCAL_CREDENTIAL_KEY_VERSION ?? "1";
const version = Number(requestedVersion);
if (!Number.isInteger(version) || version < 1 || version > 2_147_483_647) {
  throw new Error("Credential key version must be a positive integer");
}

const additions = [];
if (!source.endsWith("\n") && source.length > 0) additions.push("");
additions.push(
  "# Generated once for local provider credential encryption. Do not commit this file.",
);
if (!configuredVersion) additions.push(`CREDENTIAL_ENCRYPTION_KEY_VERSION=${version}`);
additions.push(`CREDENTIAL_ENCRYPTION_KEY=${randomBytes(32).toString("base64")}`);
if (readValue(source, "CREDENTIAL_ENCRYPTION_PREVIOUS_KEYS") === null) {
  additions.push("CREDENTIAL_ENCRYPTION_PREVIOUS_KEYS={}");
}

await writeFile(environmentPath, `${source}${additions.join("\n")}\n`, {
  encoding: "utf8",
  mode: 0o600,
});
await chmod(environmentPath, 0o600);
console.log(`Created an ignored local credential master key (version ${version}) in .env`);
