import fs from "node:fs";
import path from "node:path";

const svgFilePattern = /\.svg$/;

const readSvgFiles = (directory) =>
	fs
		.readdirSync(directory, { withFileTypes: true })
		.flatMap((entry) => {
			const entryPath = path.join(directory, entry.name);

			if (entry.isDirectory()) {
				return readSvgFiles(entryPath);
			}

			return svgFilePattern.test(entry.name) ? [entryPath] : [];
		})
		.sort();

const getAttribute = (source, name) => {
	const match = source.match(new RegExp(`${name}="([^"]+)"`));

	return match ? match[1] : "";
};

const getSvgInner = (source) =>
	source
		.replace(/^<svg\b[^>]*>/i, "")
		.replace(/<\/svg>\s*$/i, "")
		.trim();

const normalizePaint = (source) => {
	const protectedBlocks = [];
	const protectedSource = source.replace(
		/<(mask|clipPath)\b[\s\S]*?<\/\1>/gi,
		(block) => {
			const token = `__SVG_SPRITE_PROTECTED_${protectedBlocks.length}__`;

			protectedBlocks.push(block);

			return token;
		},
	);

	return protectedBlocks.reduce(
		(result, block, index) =>
			result.replace(`__SVG_SPRITE_PROTECTED_${index}__`, block),
		protectedSource
			.replace(/\sfill="(?!none\b)[^"]*"/gi, ' fill="currentColor"')
			.replace(/\sstroke="(?!none\b)[^"]*"/gi, ' stroke="currentColor"'),
	);
};

const createSprite = (directory) => {
	const symbols = readSvgFiles(directory).map((file) => {
		const source = fs.readFileSync(file, "utf8");
		const id = path.basename(file, ".svg");
		const viewBox = getAttribute(source, "viewBox");
		const viewBoxAttribute = viewBox ? ` viewBox="${viewBox}"` : "";
		const content = normalizePaint(getSvgInner(source));

		return `<symbol id="${id}"${viewBoxAttribute} fill="currentColor">${content}</symbol>`;
	});

	return `<svg xmlns="http://www.w3.org/2000/svg">${symbols.join("")}</svg>`;
};

export const svgSpritePlugin = ({ inputDir, filename }) => {
	let root;
	let outDir;

	const getInputDirectory = () => path.resolve(root, inputDir);
	const getSprite = () => createSprite(getInputDirectory());

	return {
		name: "newmark-svg-sprite",
		enforce: "pre",
		configResolved(config) {
			root = config.root;
			outDir = config.build.outDir;
		},
		configureServer(server) {
			server.watcher.add(getInputDirectory());

			server.middlewares.use((request, response, next) => {
				if (request.url?.split("?")[0] !== `/${filename}`) {
					next();
					return;
				}

				response.writeHead(200, {
					"Content-Type": "image/svg+xml; charset=utf-8",
					"Cache-Control": "no-cache",
				});
				response.end(getSprite());
			});
		},
		writeBundle() {
			const outputFile = path.resolve(root, outDir, filename);

			fs.mkdirSync(path.dirname(outputFile), { recursive: true });
			fs.writeFileSync(outputFile, getSprite());
		},
	};
};
