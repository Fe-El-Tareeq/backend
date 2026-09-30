const crypto = require("crypto");
const ApiError = require("../../utils/ApiError");
const env = require("../../config/env");

const extensions = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "application/pdf": "pdf",
};
const encodePath = (value) =>
  value.split("/").map(encodeURIComponent).join("/");

const getConfig = () => {
  if (!env.supabaseUrl || !env.supabaseServiceRoleKey) {
    throw new ApiError(503, "Payment receipt storage is not configured.");
  }
  return {
    baseUrl: env.supabaseUrl.replace(/\/$/, ""),
    key: env.supabaseServiceRoleKey,
    bucket: env.paymentReceiptsBucket,
  };
};

const storageRequest = async (url, options, message, parseJson = false) => {
  let response;
  try {
    response = await fetch(url, options);
  } catch {
    throw new ApiError(502, message + " Storage service is unavailable.");
  }
  if (!response.ok) {
    const details = await response.text().catch(() => "");
    console.error(
      "Supabase payment receipt storage error:",
      response.status,
      details,
    );
    throw new ApiError(502, message);
  }
  return parseJson ? response.json() : undefined;
};

const upload = async (userId, invoiceId, file) => {
  const config = getConfig();
  const path =
    userId +
    "/" +
    invoiceId +
    "/" +
    crypto.randomUUID() +
    "." +
    extensions[file.mimetype];
  const url =
    config.baseUrl +
    "/storage/v1/object/" +
    encodeURIComponent(config.bucket) +
    "/" +
    encodePath(path);
  await storageRequest(
    url,
    {
      method: "POST",
      headers: {
        apikey: config.key,
        Authorization: "Bearer " + config.key,
        "Content-Type": file.mimetype,
        "x-upsert": "false",
      },
      body: file.buffer,
    },
    "Could not upload payment receipt.",
  );
  return path;
};

const remove = async (path) => {
  const config = getConfig();
  const url =
    config.baseUrl +
    "/storage/v1/object/" +
    encodeURIComponent(config.bucket) +
    "/" +
    encodePath(path);
  return storageRequest(
    url,
    {
      method: "DELETE",
      headers: { apikey: config.key, Authorization: "Bearer " + config.key },
    },
    "Could not delete payment receipt.",
  );
};

const createSignedUrl = async (path, expiresIn = 300) => {
  const config = getConfig();
  const url =
    config.baseUrl +
    "/storage/v1/object/sign/" +
    encodeURIComponent(config.bucket) +
    "/" +
    encodePath(path);
  const result = await storageRequest(
    url,
    {
      method: "POST",
      headers: {
        apikey: config.key,
        Authorization: "Bearer " + config.key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ expiresIn }),
    },
    "Could not create payment receipt access URL.",
    true,
  );
  const signedPath = result.signedURL || result.signedUrl;
  if (!signedPath)
    throw new ApiError(502, "Storage did not return a payment receipt URL.");
  return signedPath.startsWith("http")
    ? signedPath
    : config.baseUrl + "/storage/v1" + signedPath;
};

module.exports = { upload, remove, createSignedUrl };
