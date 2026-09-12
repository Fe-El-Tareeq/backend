const prisma = require("../../config/prisma");
const find = (userId, termsVersion, privacyVersion) =>
  prisma.legalAcceptance.findUnique({
    where: {
      userId_termsVersion_privacyVersion: {
        userId,
        termsVersion,
        privacyVersion,
      },
    },
  });
const create = (data) => prisma.legalAcceptance.create({ data });
module.exports = { find, create };
