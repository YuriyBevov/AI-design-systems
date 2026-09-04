import {
  createWidgetSessionRequestSchema,
  createWidgetSessionResponseSchema,
} from "@ai-assist/contracts";

import { createWidgetSession, prepareWidgetPreflight } from "../../../../services/widget";

export default defineEventHandler(async (event) => {
  prepareWidgetPreflight(event);
  const parsed = createWidgetSessionRequestSchema.safeParse(await readBody(event));
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: "Invalid widget session request" });
  }
  return createWidgetSessionResponseSchema.parse(await createWidgetSession(event, parsed.data));
});
