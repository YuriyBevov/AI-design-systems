import { defineConfig } from "astro/config";
import { svgSpritePlugin } from "./scripts/svg-sprite-plugin.mjs";

export default defineConfig({
  output: "static",
  vite: {
    css: {
      preprocessorOptions: {
        scss: {
          api: "modern-compiler",
        },
      },
    },
    plugins: [
      svgSpritePlugin({
        inputDir: "src/sprite",
        filename: "sprite.svg",
      }),
    ],
  },
});