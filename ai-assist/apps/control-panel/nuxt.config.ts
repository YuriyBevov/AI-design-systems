import { fileURLToPath } from "node:url";

export default defineNuxtConfig({
  compatibilityDate: "2026-09-01",
  css: ["~/assets/css/main.css"],
  devtools: { enabled: true },
  modules: [],
  nitro: {
    errorHandler: fileURLToPath(new URL("./server/error-handler.ts", import.meta.url)),
    preset: "node-server",
    routeRules: {
      "/widget/v1/**": {
        headers: {
          "access-control-allow-origin": "*",
          "cross-origin-resource-policy": "cross-origin",
          "cache-control": "public, max-age=300",
        },
      },
    },
  },
  runtimeConfig: {
    public: {
      appName: "AI Assist",
    },
  },
  typescript: {
    strict: true,
    typeCheck: true,
  },
  vite: {
    server: {
      fs: {
        allow: ["../.."],
      },
    },
  },
});
