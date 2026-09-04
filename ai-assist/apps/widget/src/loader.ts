import { loadWidget } from "./loader-core";

const loaderScript = document.currentScript;

if (!(loaderScript instanceof HTMLScriptElement) || !loaderScript.src) {
  throw new Error("AI Assist loader must be loaded from a script URL");
}

void loadWidget(loaderScript.src).catch(() => {
  window.dispatchEvent(new CustomEvent("ai-assist:error", { detail: { code: "widget_load" } }));
});
