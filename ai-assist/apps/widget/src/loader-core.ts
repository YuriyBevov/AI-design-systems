const widgetFileName = "widget.js";

export const resolveWidgetUrl = (loaderUrl: string): string =>
  new URL(widgetFileName, loaderUrl).toString();

export const loadWidget = async (loaderUrl: string): Promise<void> => {
  const widgetUrl = resolveWidgetUrl(loaderUrl);
  await import(/* @vite-ignore */ widgetUrl);
};
