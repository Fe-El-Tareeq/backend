const multer = require("multer");
const ApiError = require("../../utils/ApiError");

const allowedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const requiredFields = ["idFrontImage", "idBackImage", "selfieImage"];
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 3 },
  fileFilter: (req, file, callback) => {
    if (!allowedMimeTypes.has(file.mimetype)) {
      return callback(
        new ApiError(400, "Only JPEG, PNG, and WebP images are allowed."),
      );
    }
    return callback(null, true);
  },
});

const validImageContent = (file) => {
  const bytes = file.buffer;
  const jpeg =
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff;
  const png =
    bytes.length >= 8 &&
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const webp =
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString() === "RIFF" &&
    bytes.subarray(8, 12).toString() === "WEBP";
  return (
    (file.mimetype === "image/jpeg" && jpeg) ||
    (file.mimetype === "image/png" && png) ||
    (file.mimetype === "image/webp" && webp)
  );
};

const uploadIdentityVerification = (req, res, next) => {
  upload.fields(requiredFields.map((name) => ({ name, maxCount: 1 })))(
    req,
    res,
    (error) => {
      if (error instanceof multer.MulterError) {
        const message =
          error.code === "LIMIT_FILE_SIZE"
            ? "Each identity image must not exceed 5 MB."
            : "Exactly one front ID, back ID, and selfie image are allowed.";
        return next(new ApiError(400, message));
      }
      if (error) return next(error);

      const files = req.files || {};
      if (requiredFields.some((name) => !files[name]?.[0])) {
        return next(
          new ApiError(
            400,
            "Front ID, back ID, and selfie images are required.",
          ),
        );
      }
      if (requiredFields.some((name) => !validImageContent(files[name][0]))) {
        return next(
          new ApiError(400, "One or more uploaded files are not valid images."),
        );
      }
      return next();
    },
  );
};

module.exports = { uploadIdentityVerification };
