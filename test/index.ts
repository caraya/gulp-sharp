import { expect } from "chai";
import glob from "glob-promise";
import { it, describe, beforeEach } from "mocha";
import { unlink, existsSync, writeFileSync, mkdirSync, readdirSync } from "fs";
import { promisify } from "util";
import { basename, extname } from "path";
import gulp from "gulp";
import sharp from "sharp";
import sharpResponsive from "../lib/index.js";

const { src, dest } = gulp;

const asyncUnlink = promisify(unlink);

const TEST_DIR = process.cwd() + "/test";
const SOURCE_DIR = TEST_DIR + "/misc/src/img";
const DEST_DIR = TEST_DIR + "/misc/dist/img";
const IMAGE_FILE_PATTERN = /\.(jpe?g|png|webp|gif|tif|tiff|avif|heif|heic|jxl)$/i;

const SUPPORTED_FORMATS: Array<"jpeg" | "png" | "webp" | "gif" | "tiff" | "avif" | "heif" | "jxl"> = [
	"jpeg",
	"png",
	"webp",
	"gif",
	"tiff",
	"avif",
	"heif",
	"jxl",
];

const DEFAULT_JPEG_BASE64 = "/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEAAkGBxAQEBAQEA8QDw8PDw8PDw8PDw8PDw8PFREWFhURFRUYHSggGBolGxUVITEhJSkrLi4uFx8zODMtNygtLisBCgoKDg0OGhAQGi0fHyUtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLf/AABEIAAEAAQMBIgACEQEDEQH/xAAXAAEAAwAAAAAAAAAAAAAAAAAABQYH/8QAHxAAAgIBBAMAAAAAAAAAAAAAAQIAAwQREiExQWEi/8QAFQEBAQAAAAAAAAAAAAAAAAAABAX/xAAYEQADAQEAAAAAAAAAAAAAAAAAARECEv/aAAwDAQACEQMRAD8Asq0qx8rJ+Q8fQ0qXbQ4yW0L4HFTfQxQxwQbJg0hB7rV1JzW2Jm4Xf/2Q==";

const getSharpFormatSupport = (format: typeof SUPPORTED_FORMATS[number]) => {
	if ((sharp as any).format?.[format]) {
		return (sharp as any).format[format];
	}

	if (format === "avif") {
		return (sharp as any).format?.heif;
	}

	if (format === "heif") {
		return (sharp as any).format?.heif;
	}

	return undefined;
};

const normalizeFormatFromExtension = (filePath: string): string => {
	const extension = extname(filePath).slice(1).toLowerCase();

	if (extension === "jpg") {
		return "jpeg";
	}

	if (extension === "tif") {
		return "tiff";
	}

	if (extension === "heic") {
		return "heif";
	}

	return extension;
};

const ensureSourceImages = (): string[] => {
	mkdirSync(SOURCE_DIR, { recursive: true });

	let files = readdirSync(SOURCE_DIR)
		.filter((fileName) => IMAGE_FILE_PATTERN.test(fileName))
		.map((fileName) => `${SOURCE_DIR}/${fileName}`);

	if (files.length === 0) {
		const defaultImagePath = `${SOURCE_DIR}/image.jpg`;
		writeFileSync(defaultImagePath, Buffer.from(DEFAULT_JPEG_BASE64, "base64"));
		files = [defaultImagePath];
	}

	return files;
};

const sourceImagePaths = ensureSourceImages();

beforeEach(async () => {
	const files = await glob(DEST_DIR + "/*");
	const fileDeletions = files.map(file => asyncUnlink(file));

	await Promise.all(fileDeletions);
});

describe("formats", () => {
	for (const sourceImagePath of sourceImagePaths) {
		const sourceFormat = normalizeFormatFromExtension(sourceImagePath);
		const sourceFileName = basename(sourceImagePath);

		for (const targetFormat of SUPPORTED_FORMATS) {
			if (targetFormat === sourceFormat) {
				continue;
			}

			it(`should convert ${sourceFileName} to ${targetFormat}`, function (done) {
				const formatSupport = getSharpFormatSupport(targetFormat);

				if (!formatSupport || formatSupport.output?.file !== true) {
					this.skip();
					return done();
				}

				const sourceExtension = extname(sourceImagePath).slice(1).toLowerCase();
				const outputExtension = targetFormat === "jpeg" && sourceExtension === "jpg"
					? "jpg"
					: targetFormat;
				const outputFileName = basename(sourceImagePath, extname(sourceImagePath));
				const outputPath = `${DEST_DIR}/${outputFileName}-${targetFormat}.${outputExtension}`;

				src(sourceImagePath)
					.pipe(sharpResponsive({
						formats: [
							{
								width: 40,
								format: targetFormat,
								rename: { suffix: `-${targetFormat}` },
								...(targetFormat === "avif" ? { avifOptions: { compression: "av1" } as any } : {}),
							}
						]
					}))
					.pipe(dest(DEST_DIR))
					.on("finish", () => {
						expect(existsSync(outputPath)).to.be.true;
						done();
					})
					.on("error", done);
			});
		}
	}
});
