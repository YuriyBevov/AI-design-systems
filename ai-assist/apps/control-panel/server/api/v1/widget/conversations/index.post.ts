import {
  createWidgetConversationRequestSchema,
  widgetConversationResponseSchema,
} from "@ai-assist/contracts";

import { createWidgetConversation, prepareWidgetPreflight } from "../../../../services/widget";

export default defineEventHandler(async (event) => {
  prepareWidgetPreflight(event);
  const parsed = createWidgetConversationRequestSchema.safeParse((await readBody(event)) ?? {});
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: "Invalid widget conversation request" });
  }
  return widgetConversationResponseSchema.parse(await createWidgetConversation(event));
});
