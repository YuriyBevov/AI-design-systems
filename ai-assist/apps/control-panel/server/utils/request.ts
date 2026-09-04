import { randomUUID } from "node:crypto";

import type { H3Event } from "h3";

export const getRequestId = (event: H3Event): string => {
  const incoming = getRequestHeader(event, "x-request-id");
  const requestId = incoming && /^[a-zA-Z0-9._:-]{1,128}$/.test(incoming) ? incoming : randomUUID();
  setResponseHeader(event, "x-request-id", requestId);
  return requestId;
};

export const getRequestSubject = (event: H3Event): string =>
  event.node.req.socket.remoteAddress ?? "unknown";

export const assertSameOrigin = (event: H3Event): void => {
  const origin = getRequestHeader(event, "origin");
  const requestOrigin = getRequestURL(event).origin;
  const fetchSite = getRequestHeader(event, "sec-fetch-site");

  if (!origin || origin !== requestOrigin) {
    throw createError({ statusCode: 403, statusMessage: "Origin validation failed" });
  }

  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
    throw createError({ statusCode: 403, statusMessage: "Cross-site request blocked" });
  }
};
