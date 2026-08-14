import { defineConfig } from "vite";
import svgSpritemap from "vite-plugin-svg-spritemap";

export default defineConfig({
  root: ".",
  base: "./",
  css: {
    preprocessorOptions: {
      scss: {
        api: "modern-compiler",
      },
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  plugins: [
    svgSpritemap({
      pattern: "src/sprite/**/*.svg",
      filename: "sprite.svg",
      prefix: "",
      svgo: {
        multipass: true,
        plugins: [
          { name: "cleanupAttrs", params: { removeEmptyAttrs: true } },
          {
            name: "removeAttrs",
            params: {
              attrs: ["fill", "fill-rule", "stroke", "stroke-width"],
            },
          },
        ],
      },
    }),
  ],
});
