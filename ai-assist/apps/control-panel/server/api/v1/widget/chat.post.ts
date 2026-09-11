import { widgetChatRequestSchema } from "@ai-assist/contracts";

import { prepareWidgetPreflight, streamWidgetChat } from "../../../services/widget";

export default defineEventHandler(async (event) => {
  prepareWidgetPreflight(event);
  const parsed = widgetChatRequestSchema.safeParse(await readBody(event));
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: "Некорректный запрос к чату" });
  }
  await streamWidgetChat(event, parsed.data);
});
