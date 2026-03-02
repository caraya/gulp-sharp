import through2 from 'through2';
import PluginError from 'plugin-error';
import sharp from 'sharp';
import rename from 'rename';
import Vinyl from 'vinyl';
import imageSize from 'image-size';

var getError = function (error) { return new PluginError("gulp-sharp-responsive", error); };
var getFileExtension = function (path) {
    var extension = (/[^./\\]*$/.exec(path) || [""])[0];
    if (extension === "jpg") {
        extension = "jpeg";
    }
    return extension.toLowerCase();
};
var getFormat = function (filePath, format) {
    if (typeof format === "string") {
        return format;
    }
    return getFileExtension(filePath);
};
var formatIsValid = function (format) {
    return ["jpeg", "png", "webp", "gif", "tiff", "avif", "heif", "jxl"].includes(format);
};
var getHeifOptions = function (option) {
    if (typeof option.heifOptions === "object" && option.heifOptions !== null) {
        return option.heifOptions;
    }
    var avifOptions = option.avifOptions;
    if (typeof avifOptions === "object" &&
        avifOptions !== null &&
        avifOptions.compression === "av1") {
        return avifOptions;
    }
    return { compression: "hevc" };
};
var addImageOptimizationStep = function (promise, format, option) {
    var updatedPromise = promise;
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
var updateFilePathWithDesiredFormat = function (originalFilePath, format) {
    var updatedFilePath = originalFilePath;
    var originalFileExtension = getFileExtension(originalFilePath);
    if (typeof format === "string" && originalFileExtension !== format) {
        updatedFilePath = rename(updatedFilePath, {
            extname: "." + format,
        }).toString();
    }
    return updatedFilePath;
};
var index = (function (options) {
    return through2.obj(function (file, encoding, callback) {
        var _this = this;
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
        var promises = [];
        var _loop_1 = function (option) {
            var format = getFormat(file.path, option.format);
            if (!formatIsValid(format)) {
                this_1.emit("error", getError(file.path + ": invalid file format detected (" + format + ")."));
                return "continue";
            }
            var width = void 0;
            // Processing width if it is an anonymous function
            if (typeof option.width === "function") {
                var fileSize = imageSize(file.contents);
                if (fileSize.width === undefined || fileSize.height === undefined) {
                    this_1.emit("error", getError(file.path + ": image size computation failed."));
                    return "continue";
                }
                width = option.width({ width: fileSize.width, height: fileSize.height });
                if (typeof width !== "number") {
                    this_1.emit("error", getError(file.path + ": callback must return a number."));
                    return "continue";
                }
            }
            else if (typeof option.width === "number") {
                width = option.width;
            }
            var promise = sharp(file.contents, typeof option.sharp === "object" && option.sharp !== null ? option.sharp : {});
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
                getHeifOptions(option));
            }
            else {
                // @ts-ignore FormatEnum from Sharp does not accept strings, but documentation shows it accepts...
                promise = promise.toFormat(format);
            }
            promise = addImageOptimizationStep(promise, format, option);
            var filePath = file.path;
            if (option.rename) {
                if (typeof option.rename.extname === "string") {
                    this_1.emit("error", getError(file.path + ": detected rename.extname option, but it is insecure since this plugin takes care of the output file extension (changing it may compromise the result)."));
                    return "continue";
                }
                filePath = rename(filePath, option.rename).toString();
            }
            filePath = updateFilePathWithDesiredFormat(filePath, option.format);
            promises.push(promise.toBuffer().then(function (buffer) {
                _this.push(new Vinyl({
                    base: file.base,
                    contents: buffer,
                    path: filePath,
                    // @ts-ignore internal Vinyl property
                    _cachedKey: file._cachedKey,
                }));
            }));
        };
        var this_1 = this;
        for (var _i = 0, _a = options.formats; _i < _a.length; _i++) {
            var option = _a[_i];
            _loop_1(option);
        }
        Promise.all(promises)
            .then(function () {
            callback(null, options.includeOriginalFile === true ? file : null);
        })
            .catch(function (error) { return _this.emit("error", getError(error)); });
    });
});

export default index;
