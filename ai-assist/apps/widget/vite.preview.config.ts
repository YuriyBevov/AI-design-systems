import { defineConfig } from "vite";

export default defineConfig({
  root: "preview",
  server: {
    port: 4173,
    strictPort: true,
  },
});
