const ApiError = require("./ApiError");
const env = require("../config/env");

// Secret API keys are opaque credentials, not bearer JWTs.
const storageAuthHeaders = () => {
  const secret = env.supabaseSecretKey?.trim();
  if (secret) {
    if (!secret.startsWith("sb_secret_")) {
      throw new ApiError(503, "Storage requires a server secret key.");
    }
    return { apikey: secret };
  }
  const legacy = env.supabaseServiceRoleKey?.trim();
  let role;
  try {
    const parts = (legacy || "").split(".");
    if (parts.length === 3) {
      role = JSON.parse(Buffer.from(parts[1], "base64url").toString()).role;
    }
  } catch {
    // Reject malformed configuration before sending any request.
  }
  if (role !== "service_role") {
    throw new ApiError(503, "Configure SUPABASE_SECRET_KEY or a legacy service_role JWT for storage.");
  }
  return { apikey: legacy, Authorization: `Bearer ${legacy}` };
};

module.exports = { storageAuthHeaders };
