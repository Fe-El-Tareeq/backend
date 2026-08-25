const multer = require("multer");
const ApiError = require("../../utils/ApiError");

const allowedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, callback) => {
    if (!allowedMimeTypes.has(file.mimetype)) {
      return callback(new ApiError(400, "Only JPEG, PNG, and WebP images are allowed."));
    }
    return callback(null, true);
  },
});

const uploadProfileImage = (req, res, next) => {
  upload.single("image")(req, res, (error) => {
    if (!error) {
      if (!req.file) return next();
      const bytes = req.file.buffer;
      const isJpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
      const isPng = bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      const isWebp = bytes.length >= 12 && bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WEBP";
      const matchesMimeType =
        (req.file.mimetype === "image/jpeg" && isJpeg) ||
        (req.file.mimetype === "image/png" && isPng) ||
        (req.file.mimetype === "image/webp" && isWebp);
      if (!matchesMimeType) {
        return next(new ApiError(400, "Uploaded file content is not a valid image."));
      }
      return next();
    }
    if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
      return next(new ApiError(400, "Profile image must not exceed 5 MB."));
    }
    return next(error);
  });
};

module.exports = { uploadProfileImage };
