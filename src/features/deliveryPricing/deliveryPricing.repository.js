const prisma = require("../../config/prisma");

const findActiveNeighborhoodById = (id, client = prisma) =>
  client.neighborhood.findFirst({
    where: { id, isActive: true },
    select: { id: true, key: true, name: true, governorate: true, isActive: true },
  });

module.exports = { findActiveNeighborhoodById };
