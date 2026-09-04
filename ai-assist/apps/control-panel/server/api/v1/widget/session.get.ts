import { widgetSessionResponseSchema } from "@ai-assist/contracts";

import { getWidgetSession, prepareWidgetPreflight } from "../../../services/widget";

export default defineEventHandler(async (event) => {
  prepareWidgetPreflight(event);
  return widgetSessionResponseSchema.parse(await getWidgetSession(event));
});
