jest.mock("../src/config/env", () => ({
  supabaseUrl: "https://storage.example.test",
  identityVerificationsBucket: "identity-verifications",
  profileImagesBucket: "profile-images",
  paymentReceiptsBucket: "payment-receipts",
}));
const env = require("../src/config/env");
const { storageAuthHeaders } = require("../src/utils/supabaseStorageAuth");
const identity = require("../src/features/users/identityVerification.storage");
const profile = require("../src/features/users/profileImage.storage");
const receipt = require("../src/features/payments/paymentReceipt.storage");
const file = { buffer: Buffer.from("test image"), mimetype: "image/png" };
const operations = [
  ["identity upload", () => identity.upload("user", "front", file)],
  ["identity delete", () => identity.remove("user/front.png")],
  ["identity signed URL", () => identity.createSignedUrl("user/front.png")],
  ["profile upload", () => profile.upload("user", file)],
  ["profile delete", () => profile.remove("user/image.png")],
  ["receipt upload", () => receipt.upload("user", "invoice", file)],
  ["receipt delete", () => receipt.remove("user/receipt.png")],
  ["receipt signed URL", () => receipt.createSignedUrl("user/receipt.png")],
];
const legacyKey = "header." + Buffer.from(JSON.stringify({ role: "service_role" })).toString("base64url") + ".signature";
const originalFetch = global.fetch;
beforeEach(() => {
  env.supabaseSecretKey = "sb_secret_test_only";
  env.supabaseServiceRoleKey = "sb_publishable_test_only";
  env.supabaseUrl = "https://storage.example.test";
  global.fetch = jest.fn().mockResolvedValue({
    ok: true, json: async () => ({ signedURL: "/object/sign/test?token=fake" }),
  });
});
afterEach(() => { global.fetch = originalFetch; jest.restoreAllMocks(); });

test.each(operations)("%s uses the new secret without a bearer header", async (_, operation) => {
  await operation();
  expect(global.fetch).toHaveBeenCalledTimes(1);
  const [url, options] = global.fetch.mock.calls[0];
  expect(url).toMatch(/^https:\/\/storage.example.test\/storage\/v1\/object/);
  expect(options.headers.apikey).toBe("sb_secret_test_only");
  expect(options.headers).not.toHaveProperty("Authorization");
  if (options.body === file.buffer) expect(options.headers["Content-Type"]).toBe("image/png");
});
test.each(operations)("%s supports the legacy service_role JWT fallback", async (_, operation) => {
  env.supabaseSecretKey = "";
  env.supabaseServiceRoleKey = legacyKey;
  await operation();
  expect(global.fetch.mock.calls[0][1].headers).toMatchObject({
    apikey: legacyKey, Authorization: "Bearer " + legacyKey,
  });
});
test.each([null, "sb_publishable_example", "malformed", "header.bad.signature",
  "header." + Buffer.from(JSON.stringify({ role: "anon" })).toString("base64url") + ".signature",
])("rejects an absent, public or invalid fallback without network access (%s)", async (key) => {
  env.supabaseSecretKey = null;
  env.supabaseServiceRoleKey = key;
  await expect(identity.upload("user", "front", file)).rejects.toMatchObject({ statusCode: 503 });
  expect(global.fetch).not.toHaveBeenCalled();
});
test("invalid explicit secret does not silently fall back to the legacy key", () => {
  env.supabaseSecretKey = "sb_publishable_example";
  env.supabaseServiceRoleKey = legacyKey;
  expect(storageAuthHeaders).toThrow("Storage requires a server secret key.");
});
test("trims credentials", () => {
  env.supabaseSecretKey = "  sb_secret_test_only  ";
  expect(storageAuthHeaders()).toEqual({ apikey: "sb_secret_test_only" });
});
test("missing URL fails before network access", async () => {
  env.supabaseUrl = null;
  await expect(identity.upload("user", "front", file)).rejects.toMatchObject({ statusCode: 503 });
  expect(global.fetch).not.toHaveBeenCalled();
});
test("storage rejection stays a controlled error", async () => {
  jest.spyOn(console, "error").mockImplementation(() => {});
  global.fetch.mockResolvedValue({ ok: false, status: 403, text: async () => "Access denied" });
  await expect(identity.upload("user", "front", file)).rejects.toMatchObject({
    statusCode: 502, message: "Could not upload identity document.",
  });
});
test("network failure stays a controlled error", async () => {
  global.fetch.mockRejectedValue(new Error("Network unavailable"));
  await expect(identity.upload("user", "front", file)).rejects.toMatchObject({ statusCode: 502 });
});

test("identity deletion treats an absent object as already removed", async () => {
  global.fetch.mockResolvedValue({ ok: false, status: 404 });
  await expect(identity.remove("user/already-deleted.png")).resolves.toBeUndefined();
});
test("identity requests have an abort signal to bound stalled storage connections", async () => {
  await identity.upload("user", "front", file);
  expect(global.fetch.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
});
