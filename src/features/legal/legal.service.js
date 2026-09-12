const repository = require("./legal.repository");
const current = () => ({
  termsVersion: process.env.TERMS_VERSION || "1.0.0",
  privacyVersion: process.env.PRIVACY_VERSION || "1.0.0",
  termsUrl: process.env.TERMS_URL || null,
  privacyUrl: process.env.PRIVACY_URL || null,
});
const accept = async (userId, payload) => {
  const versions = current();
  if (
    payload.termsVersion !== versions.termsVersion ||
    payload.privacyVersion !== versions.privacyVersion
  ) {
    const e = new Error(
      "Only the current legal document versions can be accepted.",
    );
    e.statusCode = 409;
    throw e;
  }
  const existing = await repository.find(
    userId,
    payload.termsVersion,
    payload.privacyVersion,
  );
  return {
    created: !existing,
    acceptance: existing || (await repository.create({ userId, ...payload })),
  };
};
module.exports = { current, accept };
