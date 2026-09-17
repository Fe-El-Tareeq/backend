const prisma = require("../../config/prisma");
const find = (userId, termsVersion, privacyVersion, client = prisma) =>
  client.legalAcceptance.findUnique({
    where: {
      userId_termsVersion_privacyVersion: {
        userId,
        termsVersion,
        privacyVersion,
      },
    },
  });
const create = (data, client = prisma) =>
  client.legalAcceptance.create({ data });
module.exports = { find, create };
