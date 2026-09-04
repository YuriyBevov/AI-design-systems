export const providerErrorCodes = [
  "PROVIDER_CREDENTIAL_INVALID",
  "PROVIDER_MODEL_UNAVAILABLE",
  "PROVIDER_RATE_LIMITED",
  "PROVIDER_BUDGET_EXCEEDED",
  "PROVIDER_TIMEOUT",
  "PROVIDER_BAD_RESPONSE",
  "PROVIDER_UNAVAILABLE",
] as const;

export type ProviderErrorCode = (typeof providerErrorCodes)[number];

export class AitunnelProviderError extends Error {
  readonly code: ProviderErrorCode;
  readonly retryable: boolean;
  readonly upstreamStatus?: number;

  constructor(input: {
    code: ProviderErrorCode;
    message: string;
    retryable: boolean;
    upstreamStatus?: number;
    cause?: unknown;
  }) {
    super(input.message, { cause: input.cause });
    this.name = "AitunnelProviderError";
    this.code = input.code;
    this.retryable = input.retryable;
    if (input.upstreamStatus !== undefined) this.upstreamStatus = input.upstreamStatus;
  }
}

export const mapAitunnelStatus = (status: number): AitunnelProviderError => {
  if (status === 401) {
    return new AitunnelProviderError({
      code: "PROVIDER_CREDENTIAL_INVALID",
      message: "AITUNNEL credential is invalid",
      retryable: false,
      upstreamStatus: status,
    });
  }

  if (status === 402) {
    return new AitunnelProviderError({
      code: "PROVIDER_BUDGET_EXCEEDED",
      message: "AITUNNEL budget is exhausted",
      retryable: false,
      upstreamStatus: status,
    });
  }

  if (status === 403 || status === 404) {
    return new AitunnelProviderError({
      code: "PROVIDER_MODEL_UNAVAILABLE",
      message: "AITUNNEL model is not available for this credential",
      retryable: false,
      upstreamStatus: status,
    });
  }

  if (status === 408 || status === 504) {
    return new AitunnelProviderError({
      code: "PROVIDER_TIMEOUT",
      message: "AITUNNEL request timed out",
      retryable: true,
      upstreamStatus: status,
    });
  }

  if (status === 429) {
    return new AitunnelProviderError({
      code: "PROVIDER_RATE_LIMITED",
      message: "AITUNNEL rate limit exceeded",
      retryable: true,
      upstreamStatus: status,
    });
  }

  if (status >= 500) {
    return new AitunnelProviderError({
      code: "PROVIDER_UNAVAILABLE",
      message: "AITUNNEL is temporarily unavailable",
      retryable: true,
      upstreamStatus: status,
    });
  }

  return new AitunnelProviderError({
    code: "PROVIDER_BAD_RESPONSE",
    message: "AITUNNEL rejected the request",
    retryable: false,
    upstreamStatus: status,
  });
};
