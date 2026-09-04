import type {
  CreateWidgetSessionResponse,
  WidgetConversationResponse,
  WidgetSessionResponse,
  WidgetSseCitation,
  WidgetSseDone,
  WidgetSseError,
  WidgetSseMeta,
  WidgetSseUsage,
} from "@ai-assist/contracts";

const widgetVersion = "1.0.0";

export type WidgetChatEvent =
  | { type: "meta"; data: WidgetSseMeta }
  | { type: "delta"; data: { text: string } }
  | { type: "citation"; data: WidgetSseCitation }
  | { type: "usage"; data: WidgetSseUsage }
  | { type: "done"; data: WidgetSseDone }
  | { type: "error"; data: WidgetSseError };

type WidgetApiErrorPayload = {
  statusCode?: number;
  statusMessage?: string;
  message?: string;
  data?: { code?: string; retryable?: boolean };
};

export class WidgetApiError extends Error {
  readonly statusCode: number;
  readonly code: string | null;
  readonly retryable: boolean;

  constructor(response: Response, payload: WidgetApiErrorPayload | null) {
    super(payload?.statusMessage ?? payload?.message ?? `Widget API returned ${response.status}`);
    this.name = "WidgetApiError";
    this.statusCode = response.status;
    this.code = payload?.data?.code ?? null;
    this.retryable = payload?.data?.retryable ?? response.status >= 500;
  }
}

export const resolveWidgetApiBase = (moduleUrl: string): string =>
  new URL("../../api/v1/", moduleUrl).toString().replace(/\/$/u, "");

const responseError = async (response: Response): Promise<WidgetApiError> => {
  const payload = await response.json().catch(() => null);
  return new WidgetApiError(response, payload as WidgetApiErrorPayload | null);
};

const jsonRequest = async <T>(url: string, init: RequestInit): Promise<T> => {
  const response = await fetch(url, init);
  if (!response.ok) throw await responseError(response);
  return (await response.json()) as T;
};

export const widgetSessionStorageKey = (apiBase: string, assistantId: string): string =>
  `ai-assist:session:${new URL(apiBase).origin}:${assistantId}`;

export const createSession = async (
  apiBase: string,
  assistantId: string,
  locale: string,
): Promise<CreateWidgetSessionResponse> =>
  jsonRequest(`${apiBase}/widget/sessions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ assistantId, locale, widgetVersion }),
  });

export const getSession = async (
  apiBase: string,
  sessionToken: string,
): Promise<WidgetSessionResponse> =>
  jsonRequest(`${apiBase}/widget/session`, {
    method: "GET",
    headers: { authorization: `Bearer ${sessionToken}` },
  });

export const createConversation = async (
  apiBase: string,
  sessionToken: string,
): Promise<WidgetConversationResponse> =>
  jsonRequest(`${apiBase}/widget/conversations`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${sessionToken}`,
      "content-type": "application/json",
    },
    body: "{}",
  });

const parseEventBlock = (block: string): WidgetChatEvent | null => {
  let eventName = "message";
  const dataLines: string[] = [];
  for (const line of block.split("\n")) {
    if (line.startsWith("event:")) eventName = line.slice(6).trim();
    if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
  }
  if (!dataLines.length) return null;
  const data: unknown = JSON.parse(dataLines.join("\n"));
  if (
    eventName !== "meta" &&
    eventName !== "delta" &&
    eventName !== "citation" &&
    eventName !== "usage" &&
    eventName !== "done" &&
    eventName !== "error"
  ) {
    return null;
  }
  return { type: eventName, data } as WidgetChatEvent;
};

export const readWidgetEventStream = async (
  response: Response,
  onEvent: (event: WidgetChatEvent) => void,
): Promise<void> => {
  if (!response.body) throw new Error("Widget API returned an empty event stream");
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  while (true) {
    const result = await reader.read();
    if (result.done) break;
    buffer += result.value.replace(/\r\n/gu, "\n");
    let boundary = buffer.indexOf("\n\n");
    while (boundary >= 0) {
      const block = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const event = parseEventBlock(block);
      if (event) onEvent(event);
      boundary = buffer.indexOf("\n\n");
    }
  }
  const finalEvent = parseEventBlock(buffer.trim());
  if (finalEvent) onEvent(finalEvent);
};

export const streamChat = async (input: {
  apiBase: string;
  sessionToken: string;
  conversationId: string | null;
  message: string;
  signal: AbortSignal;
  onEvent: (event: WidgetChatEvent) => void;
}): Promise<void> => {
  const response = await fetch(`${input.apiBase}/widget/chat`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${input.sessionToken}`,
      "content-type": "application/json",
      "idempotency-key": crypto.randomUUID(),
    },
    body: JSON.stringify({
      conversationId: input.conversationId,
      message: input.message,
      page: { url: window.location.href, title: document.title || null },
    }),
    signal: input.signal,
  });
  if (!response.ok) throw await responseError(response);
  await readWidgetEventStream(response, input.onEvent);
};
