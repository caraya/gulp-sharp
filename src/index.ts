import { Transform } from "stream";
import through2 from "through2";
import PluginError from "plugin-error";
import sharp, { Sharp } from "sharp";
import rename from "rename";
import Vinyl from "vinyl";
import IOptions from "./IOptions";
import IFormatOptions from "./IFormatOptions";
import imageSize from "image-size";

const getError = (error: string | Error): PluginError => new PluginError("gulp-sharp-responsive", error);

const getFileExtension = (path: string): string => {
  let extension = (/[^./\\]*$/.exec(path) || [""])[0];

  if (extension === "jpg") {
    extension = "jpeg";
  }

  return extension.toLowerCase();
};

const getFormat = (filePath: string, format?: string): string => {
  if (typeof format === "string") {
    return format;
  }

  return getFileExtension(filePath);
};

const formatIsValid = (format: string): boolean =>
  ["jpeg", "png", "webp", "gif", "tiff", "avif", "heif", "jxl"].includes(format);

const getHeifOptions = (option: IFormatOptions): object => {
  if (typeof option.heifOptions === "object" && option.heifOptions !== null) {
    return option.heifOptions as object;
  }

  const avifOptions = (option as any).avifOptions;

  if (
    typeof avifOptions === "object" &&
    avifOptions !== null &&
    (avifOptions as any).compression === "av1"
  ) {
    return avifOptions as object;
  }

  return { compression: "hevc" };
};

const addImageOptimizationStep = (promise: Sharp, format: string, option: IFormatOptions): Sharp => {
  let updatedPromise = promise;

  if (format === "jpeg" && typeof option.jpegOptions === "object" && option.jpegOptions !== null) {
    updatedPromise.jpeg(option.jpegOptions);
  }

  if (format === "png" && typeof option.pngOptions === "object" && option.pngOptions !== null) {
    updatedPromise.png(option.pngOptions);
  }

  if (format === "webp" && typeof option.webpOptions === "object" && option.webpOptions !== null) {
    updatedPromise.webp(option.webpOptions);
  }

  if (format === "gif" && typeof option.gifOptions === "object" && option.gifOptions !== null) {
    // @ts-ignore see issue https://github.com/DefinitelyTyped/DefinitelyTyped/issues/52448
    updatedPromise.gif(option.gifOptions);
  }

  if (format === "avif" && typeof option.avifOptions === "object" && option.avifOptions !== null) {
    updatedPromise.avif(option.avifOptions);
  }

  if (format === "heif" && typeof option.heifOptions === "object" && option.heifOptions !== null) {
    updatedPromise.heif(option.heifOptions);
  }

  if (format === "jxl" && typeof option.jxlOptions === "object" && option.jxlOptions !== null) {
    // @ts-ignore @types/sharp may not expose jxl() yet
    updatedPromise.jxl(option.jxlOptions);
  }

  if (format === "tiff" && typeof option.tiffOptions === "object" && option.tiffOptions !== null) {
    updatedPromise.tiff(option.tiffOptions);
  }

  return updatedPromise;
};

const updateFilePathWithDesiredFormat = (originalFilePath: string, format?: string): string => {
  let updatedFilePath = originalFilePath;
  const originalFileExtension = getFileExtension(originalFilePath);

  if (typeof format === "string" && originalFileExtension !== format) {
    updatedFilePath = rename(updatedFilePath, {
      extname: `.${format}`,
    }).toString();
  }

  return updatedFilePath;
};

export default (options: IOptions): Transform => {
  return through2.obj(function (file, encoding, callback) {
    if (file.isNull()) {
      this.emit("error", getError("File is null."));
      return callback(null, file);
    }

    if (file.isStream()) {
      this.emit("error", getError("Streams are not supported for the moment. If you think it should, please create an issue at https://github.com/khalyomede/gulp-sharp-responsive/issues"));
      return callback(null, file);
    }

    if (!file.isBuffer()) {
      this.emit("error", getError("Expected file to be a buffer."));
      return callback(null, file);
    }

    const promises: Array<Promise<void | Buffer>> = [];

    for (const option of options.formats) {
      const format = getFormat(file.path, option.format);

      if (!formatIsValid(format)) {
        this.emit("error", getError(`${file.path}: invalid file format detected (${format}).`));
        continue;
      }

      let width: number | undefined;

      // Processing width if it is an anonymous function
      if (typeof option.width === "function") {
        const fileSize = imageSize(file.contents);

        if (fileSize.width === undefined || fileSize.height === undefined) {
          this.emit("error", getError(`${file.path}: image size computation failed.`));
          continue;
        }

        width = option.width({ width: fileSize.width, height: fileSize.height });

        if (typeof width !== "number") {
          this.emit("error", getError(`${file.path}: callback must return a number.`));
          continue;
        }
      } else if (typeof option.width === "number") {
        width = option.width;
      }

      let promise = sharp(
        file.contents,
        typeof option.sharp === "object" && option.sharp !== null ? option.sharp : {}
      );

      // Make EXIF rotation optional, defaulting to true
      // @ts-ignore assuming autoRotate is added to the interface
      if (option.autoRotate !== false) {
        promise = promise.rotate();
      }

      // Safely apply resize only when a valid width exists
      if (width !== undefined && width > 0) {
        promise = promise.resize(width);
      }

      if (format === "heif") {
        promise = promise.heif(
          // @ts-ignore @types/sharp may be outdated for heif options
          getHeifOptions(option)
        );
      } else {
        // @ts-ignore FormatEnum from Sharp does not accept strings, but documentation shows it accepts...
        promise = promise.toFormat(format);
      }
      promise = addImageOptimizationStep(promise, format, option);

      let filePath = file.path;

      if (option.rename) {
        if (typeof option.rename.extname === "string") {
          this.emit("error", getError(`${file.path}: detected rename.extname option, but it is insecure since this plugin takes care of the output file extension (changing it may compromise the result).`));
          continue;
        }
        filePath = rename(filePath, option.rename).toString();
      }

      filePath = updateFilePathWithDesiredFormat(filePath, option.format);

      promises.push(
        promise.toBuffer().then((buffer) => {
          this.push(
            new Vinyl({
              base: file.base,
              contents: buffer,
              path: filePath,
              // @ts-ignore internal Vinyl property
              _cachedKey: file._cachedKey,
            })
          );
        })
      );
    }

    Promise.all(promises)
      .then(() => {
        callback(null, options.includeOriginalFile === true ? file : null);
      })
      .catch((error) => this.emit("error", getError(error)));
  });
};

