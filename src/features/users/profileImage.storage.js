const crypto = require("crypto");
const ApiError = require("../../utils/ApiError");
const env = require("../../config/env");

const extensions = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const encodePath = (value) => value.split("/").map(encodeURIComponent).join("/");

const getConfig = () => {
  if (!env.supabaseUrl || !env.supabaseServiceRoleKey) {
    throw new ApiError(503, "Profile image storage is not configured.");
  }
  return {
    baseUrl: env.supabaseUrl.replace(/\/$/, ""),
    key: env.supabaseServiceRoleKey,
    bucket: env.profileImagesBucket,
  };
};

const request = async (url, options, message) => {
  let response;
  try {
    response = await fetch(url, options);
  } catch {
    throw new ApiError(502, `${message} Storage service is unavailable.`);
  }
  if (!response.ok) {
    const details = await response.text().catch(() => "");
    console.error("Supabase Storage error:", response.status, details);
    throw new ApiError(502, message);
  }
};

const upload = async (userId, image) => {
  const config = getConfig();
  const path = `${userId}/${crypto.randomUUID()}.${extensions[image.mimetype]}`;
  const objectUrl = `${config.baseUrl}/storage/v1/object/${encodeURIComponent(config.bucket)}/${encodePath(path)}`;
  await request(objectUrl, {
    method: "POST",
    headers: {
      apikey: config.key,
      Authorization: `Bearer ${config.key}`,
      "Content-Type": image.mimetype,
      "x-upsert": "false",
    },
    body: image.buffer,
  }, "Could not upload profile image.");
  return {
    path,
    url: `${config.baseUrl}/storage/v1/object/public/${encodeURIComponent(config.bucket)}/${encodePath(path)}`,
  };
};

const remove = async (path) => {
  const config = getConfig();
  const objectUrl = `${config.baseUrl}/storage/v1/object/${encodeURIComponent(config.bucket)}/${encodePath(path)}`;
  await request(objectUrl, {
    method: "DELETE",
    headers: { apikey: config.key, Authorization: `Bearer ${config.key}` },
  }, "Could not delete profile image.");
};

module.exports = { upload, remove };
