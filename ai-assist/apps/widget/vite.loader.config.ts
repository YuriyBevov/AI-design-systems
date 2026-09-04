import { defineConfig } from "vite";

export default defineConfig({
  build: {
    outDir: "../control-panel/public/widget/v1",
    emptyOutDir: false,
    lib: {
      entry: "src/loader.ts",
      name: "AiAssistLoader",
      formats: ["iife"],
      fileName: () => "loader.js",
    },
  },
});
