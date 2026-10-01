const multer = require("multer");
const ApiError = require("../../utils/ApiError");

const allowedMimeTypes = new Set([
  "image/jpeg",
  "image/png",
  "application/pdf",
]);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, callback) => {
    if (!allowedMimeTypes.has(file.mimetype))
      return callback(
        new ApiError(400, "Receipt must be a PNG, JPG, or PDF file."),
      );
    return callback(null, true);
  },
});

const validContent = (file) => {
  const bytes = file.buffer;
  if (file.mimetype === "image/jpeg")
    return (
      bytes.length >= 3 &&
      bytes[0] === 0xff &&
      bytes[1] === 0xd8 &&
      bytes[2] === 0xff
    );
  if (file.mimetype === "image/png")
    return (
      bytes.length >= 8 &&
      bytes
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    );
  if (file.mimetype === "application/pdf")
    return bytes.subarray(0, 5).toString() === "%PDF-";
  return false;
};

const uploadPaymentReceipt = (req, res, next) => {
  upload.single("receipt")(req, res, (error) => {
    if (error instanceof multer.MulterError) {
      const message =
        error.code === "LIMIT_FILE_SIZE"
          ? "Receipt must not exceed 5 MB."
          : "Upload exactly one receipt file.";
      return next(new ApiError(400, message));
    }
    if (error) return next(error);
    if (!req.file)
      return next(new ApiError(400, "Payment receipt is required."));
    if (!validContent(req.file))
      return next(
        new ApiError(400, "Receipt file content does not match its file type."),
      );
    return next();
  });
};

module.exports = { uploadPaymentReceipt };
