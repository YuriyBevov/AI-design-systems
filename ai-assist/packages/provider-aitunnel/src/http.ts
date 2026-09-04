import { AitunnelProviderError, mapAitunnelStatus } from "./errors.js";

export type AitunnelHttpOptions = {
  timeoutMs: number;
  maxResponseBytes: number;
  fetchImpl: typeof fetch;
};

export const readBoundedText = async (response: Response, maxBytes: number): Promise<string> => {
  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (declaredLength > maxBytes) {
    await response.body?.cancel();
    throw new AitunnelProviderError({
      code: "PROVIDER_BAD_RESPONSE",
      message: "AITUNNEL response exceeded the configured size limit",
      retryable: false,
    });
  }

  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > maxBytes) {
      await reader.cancel();
      throw new AitunnelProviderError({
        code: "PROVIDER_BAD_RESPONSE",
        message: "AITUNNEL response exceeded the configured size limit",
        retryable: false,
      });
    }
    chunks.push(value);
  }

  const merged = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new TextDecoder().decode(merged);
};

export const requestAitunnel = async (
  url: string,
  init: RequestInit,
  options: AitunnelHttpOptions,
): Promise<Response> => {
  const timeoutController = new AbortController();
  const timeout = setTimeout(() => timeoutController.abort(), options.timeoutMs);
  const combinedSignal = init.signal
    ? AbortSignal.any([init.signal, timeoutController.signal])
    : timeoutController.signal;

  try {
    const response = await options.fetchImpl(url, { ...init, signal: combinedSignal });
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw mapAitunnelStatus(response.status);
    }
    return response;
  } catch (error) {
    if (error instanceof AitunnelProviderError) throw error;
    if (timeoutController.signal.aborted) {
      throw new AitunnelProviderError({
        code: "PROVIDER_TIMEOUT",
        message: "AITUNNEL request timed out",
        retryable: true,
        cause: error,
      });
    }
    if (init.signal?.aborted) throw error;
    throw new AitunnelProviderError({
      code: "PROVIDER_UNAVAILABLE",
      message: "Unable to reach AITUNNEL",
      retryable: true,
      cause: error,
    });
  } finally {
    clearTimeout(timeout);
  }
};

export const requestAitunnelJson = async <T>(
  url: string,
  init: RequestInit,
  options: AitunnelHttpOptions,
  parse: (value: unknown) => T,
): Promise<T> => {
  const response = await requestAitunnel(url, init, options);
  const text = await readBoundedText(response, options.maxResponseBytes);

  try {
    return parse(JSON.parse(text));
  } catch (error) {
    if (error instanceof AitunnelProviderError) throw error;
    throw new AitunnelProviderError({
      code: "PROVIDER_BAD_RESPONSE",
      message: "AITUNNEL returned malformed JSON",
      retryable: false,
      cause: error,
    });
  }
};
