import { prepareWidgetPreflight } from "../../../../services/widget";

export default defineEventHandler((event) => {
  prepareWidgetPreflight(event);
  return sendNoContent(event, 204);
});
