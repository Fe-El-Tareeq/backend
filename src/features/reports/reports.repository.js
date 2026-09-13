const prisma = require("../../config/prisma");
const select = {
  id: true,
  reportCode: true,
  reporterId: true,
  reportedUserId: true,
  assignmentId: true,
  errandId: true,
  tripId: true,
  type: true,
  description: true,
  priority: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  resolvedAt: true,
};
const findByClientKey = (reporterId, clientRequestKey) =>
  prisma.supportReport.findUnique({
    where: { reporterId_clientRequestKey: { reporterId, clientRequestKey } },
    select,
  });
const create = (data) => prisma.supportReport.create({ data, select });
const findById = (id) =>
  prisma.supportReport.findUnique({ where: { id }, select });
const listMine = ({ reporterId, status, skip, take }) =>
  prisma.supportReport.findMany({
    where: { reporterId, ...(status ? { status } : {}) },
    select,
    orderBy: { createdAt: "desc" },
    skip,
    take,
  });
const countMine = (reporterId, status) =>
  prisma.supportReport.count({
    where: { reporterId, ...(status ? { status } : {}) },
  });
const listAdmin = ({ status, skip, take }) =>
  prisma.supportReport.findMany({
    where: status ? { status } : {},
    select,
    orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
    skip,
    take,
  });
const countAdmin = (status) =>
  prisma.supportReport.count({ where: status ? { status } : {} });
const update = (id, data) =>
  prisma.supportReport.update({ where: { id }, data, select });
module.exports = {
  findByClientKey,
  create,
  findById,
  listMine,
  countMine,
  listAdmin,
  countAdmin,
  update,
};
