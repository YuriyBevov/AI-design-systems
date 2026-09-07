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
      const baseName = path.parse(file.name).name;
      const webpPath = path.join(outputDir, `${baseName}.webp`);
      const avifPath = path.join(outputDir, `${baseName}.avif`);
      const image = sharp(sourcePath).rotate().resize({ width: 1920, withoutEnlargement: true });

      await Promise.all([
        image.clone().webp({ quality: 82 }).toFile(webpPath),
        image.clone().avif({ quality: 58 }).toFile(avifPath),
      ]);
    }),
);
