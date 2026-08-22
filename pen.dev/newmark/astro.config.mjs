import { defineConfig } from "astro/config";
import svgSpritemap from "vite-plugin-svg-spritemap";

export default defineConfig({
  vite: {
    css: {
      preprocessorOptions: {
        scss: {
          api: "modern-compiler",
        },
      },
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
  },
});
