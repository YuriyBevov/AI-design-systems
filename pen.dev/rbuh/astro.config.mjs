import { defineConfig } from "astro/config";
import node from "@astrojs/node";
import { svgSpritePlugin } from "./scripts/svg-sprite-plugin.mjs";

export default defineConfig({
  output: "server",
  adapter: node({
    mode: "standalone",
  }),
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
