const { createRepository } = require("../../utils/featureScaffold");
const prisma = require("../../config/prisma");
const { FEATURE_NAME } = require("./locations.constants");

const scaffoldRepository = createRepository(FEATURE_NAME);

const findActiveNeighborhoods = async ({ governorate } = {}) => {
  return prisma.neighborhood.findMany({
    where: {
      isActive: true,
      key: {
        not: null,
      },
      ...(governorate ? { governorate } : {}),
    },
    select: {
      id: true,
      key: true,
      name: true,
      governorate: true,
    },
    orderBy: [
      {
        governorate: "asc",
      },
      {
        name: "asc",
      },
    ],
  });
};

module.exports = {
  ...scaffoldRepository,
  findActiveNeighborhoods,
};
