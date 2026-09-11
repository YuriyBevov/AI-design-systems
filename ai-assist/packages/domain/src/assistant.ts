import { createHash } from "node:crypto";

export type AssistantOriginEnvironment = "production" | "preview";

export type AssistantOriginInput = {
  origin: string;
};

export type NormalizedAssistantOrigin = AssistantOriginInput & {
  environment: AssistantOriginEnvironment;
  scheme: "http" | "https";
  host: string;
  port: number | null;
};

export type AssistantOriginValidationErrorCode =
  "ASSISTANT_ORIGIN_DUPLICATE" | "ASSISTANT_ORIGIN_HTTPS_REQUIRED" | "ASSISTANT_ORIGIN_INVALID";

export type AssistantOriginNormalizationResult =
  | { success: true; origins: NormalizedAssistantOrigin[] }
  | { success: false; code: AssistantOriginValidationErrorCode; index: number };

const previewHttpHosts = new Set(["127.0.0.1", "::1", "[::1]", "localhost"]);

const normalizeOrigin = (
  input: AssistantOriginInput,
): NormalizedAssistantOrigin | AssistantOriginValidationErrorCode => {
  const rawOrigin = input.origin.trim();
  if (!rawOrigin || rawOrigin.includes("*")) return "ASSISTANT_ORIGIN_INVALID";

  let url: URL;
  try {
    url = new URL(rawOrigin);
  } catch {
    return "ASSISTANT_ORIGIN_INVALID";
  }

  if (
    (url.protocol !== "https:" && url.protocol !== "http:") ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    url.origin === "null"
  ) {
    return "ASSISTANT_ORIGIN_INVALID";
  }

  const isLocalPreview = previewHttpHosts.has(url.hostname.toLowerCase());
  if (url.protocol === "http:" && !isLocalPreview) return "ASSISTANT_ORIGIN_HTTPS_REQUIRED";

  return {
    origin: url.origin.toLowerCase(),
    environment: isLocalPreview ? "preview" : "production",
    scheme: url.protocol.slice(0, -1) as "http" | "https",
    host: url.hostname.toLowerCase(),
    port: url.port ? Number(url.port) : null,
  };
};

export const normalizeAssistantOrigins = (
  inputs: AssistantOriginInput[],
): AssistantOriginNormalizationResult => {
  const origins: NormalizedAssistantOrigin[] = [];
  const seen = new Set<string>();

  for (const [index, input] of inputs.entries()) {
    const normalized = normalizeOrigin(input);
    if (typeof normalized === "string") return { success: false, code: normalized, index };
    if (seen.has(normalized.origin)) {
      return { success: false, code: "ASSISTANT_ORIGIN_DUPLICATE", index };
    }
    seen.add(normalized.origin);
    origins.push(normalized);
  }

  return {
    success: true,
    origins: origins.sort((left, right) => left.origin.localeCompare(right.origin)),
  };
};

export const checksumAssistantConfig = (config: Record<string, unknown>): string =>
  createHash("sha256").update(JSON.stringify(config), "utf8").digest("hex");
