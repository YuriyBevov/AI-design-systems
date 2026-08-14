import { mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const sourceDir = path.resolve("src/images");
const outputDir = path.resolve("src/images/webp");
const supportedExtensions = new Set([".jpg", ".jpeg", ".png"]);

await mkdir(outputDir, { recursive: true });

const files = await readdir(sourceDir, { withFileTypes: true });

await Promise.all(
  files
    .filter((file) => file.isFile())
    .filter((file) => supportedExtensions.has(path.extname(file.name).toLowerCase()))
    .map(async (file) => {
      const sourcePath = path.join(sourceDir, file.name);
      const outputPath = path.join(outputDir, `${path.parse(file.name).name}.webp`);

      await sharp(sourcePath)
        .webp({ quality: 82 })
        .toFile(outputPath);
    }),
);
