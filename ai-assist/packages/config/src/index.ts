import { z } from "zod";

const urlSchema = z.string().url();
const localSessionSecret = "local-development-session-secret-change-before-production";
const localCredentialEncryptionKey = "bG9jYWwtZGV2ZWxvcG1lbnQtZW5jcnlwdGlvbi1rZXk=";

export const isLocalCredentialEncryptionKey = (value: string): boolean =>
  value === localCredentialEncryptionKey;

export const isValidCredentialEncryptionKey = (value: string): boolean => {
  const decoded = Buffer.from(value, "base64");
  const normalizedInput = value.replace(/=+$/u, "");
  const normalizedDecoded = decoded.toString("base64").replace(/=+$/u, "");
  const isValid = decoded.length === 32 && normalizedDecoded === normalizedInput;
  decoded.fill(0);
  return isValid;
};

export const serviceEnvironmentSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    DATABASE_URL: urlSchema.default(
      "postgresql://ai_assist:change-me-local-only@localhost:55432/ai_assist",
    ),
    REDIS_URL: urlSchema.default("redis://localhost:6379"),
    S3_ENDPOINT: urlSchema.default("http://localhost:9000"),
    S3_REGION: z.string().min(1).default("local"),
    S3_BUCKET: z.string().min(1).default("ai-assist-dev"),
    S3_ACCESS_KEY_ID: z.string().min(1).default("ai-assist"),
    S3_SECRET_ACCESS_KEY: z.string().min(1).default("change-me-local-only"),
    SESSION_SECRET: z.string().min(32).default(localSessionSecret),
    ADMIN_SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(168).default(12),
    LOGIN_RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(100).default(10),
    LOGIN_RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),
    PROMPT_PREVIEW_RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(100).default(12),
    PROMPT_PREVIEW_RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().min(10).max(3600).default(60),
    WIDGET_SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(720).default(72),
    WIDGET_SESSION_RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(1_000).default(30),
    WIDGET_SESSION_RATE_LIMIT_WINDOW_SECONDS: z.coerce
      .number()
      .int()
      .min(10)
      .max(3_600)
      .default(60),
    WIDGET_CHAT_RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(1_000).default(20),
    WIDGET_CHAT_RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().min(10).max(3_600).default(60),
    CREDENTIAL_ENCRYPTION_KEY_VERSION: z.coerce.number().int().min(1).max(2_147_483_647).default(1),
    CREDENTIAL_ENCRYPTION_KEY: z.string().min(43).default(localCredentialEncryptionKey),
    CREDENTIAL_ENCRYPTION_PREVIOUS_KEYS: z.string().default("{}"),
    AITUNNEL_BASE_URL: urlSchema.default("https://api.aitunnel.ru/v1"),
    AITUNNEL_PUBLIC_CATALOG_URL: urlSchema.default(
      "https://api.aitunnel.ru/public/aitunnel/models",
    ),
    PROVIDER_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(30_000).default(8_000),
    PROVIDER_RESPONSE_MAX_BYTES: z.coerce
      .number()
      .int()
      .min(16_384)
      .max(1_048_576)
      .default(1_048_576),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),
  })
  .superRefine((environment, context) => {
    if (
      environment.NODE_ENV === "production" &&
      environment.SESSION_SECRET === localSessionSecret
    ) {
      context.addIssue({
        code: "custom",
        message: "SESSION_SECRET must be replaced in production",
        path: ["SESSION_SECRET"],
      });
    }

    if (
      environment.NODE_ENV === "production" &&
      environment.CREDENTIAL_ENCRYPTION_KEY === localCredentialEncryptionKey
    ) {
      context.addIssue({
        code: "custom",
        message: "CREDENTIAL_ENCRYPTION_KEY must be replaced in production",
        path: ["CREDENTIAL_ENCRYPTION_KEY"],
      });
    }
  });

export type ServiceEnvironment = z.infer<typeof serviceEnvironmentSchema>;

export const parseServiceEnvironment = (
  input: Record<string, string | undefined>,
): ServiceEnvironment => serviceEnvironmentSchema.parse(input);
