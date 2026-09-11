import { getRequestURL, send, setResponseHeaders, setResponseStatus } from "h3";

import { getRussianServerErrorMessage } from "./utils/error-localization";

export default defineNitroErrorHandler(async (error, event, { defaultHandler }) => {
  if (!getRequestURL(event).pathname.startsWith("/api/")) return;

  const statusCode = error.statusCode || 500;
  const message = getRussianServerErrorMessage({
    statusCode,
    statusMessage: error.statusMessage,
    message: error.message,
  });
  const response = await defaultHandler(error, event, { json: true });
  const body =
    typeof response.body === "object" && response.body !== null
      ? { ...response.body, statusMessage: message, message }
      : { error: true, statusCode, statusMessage: message, message };

  setResponseHeaders(event, response.headers);
  setResponseStatus(event, response.status);
  return send(event, JSON.stringify(body, null, 2));
});
