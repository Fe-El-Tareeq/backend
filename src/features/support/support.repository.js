const prisma = require("../../config/prisma");

const ticketInclude = {
  messages: {
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    include: { sender: { select: { id: true, fullName: true, role: true } } },
  },
};
const transaction = (callback) => prisma.$transaction(callback);
const findByClientKey = (userId, clientRequestKey, client = prisma) =>
  client.supportTicket.findUnique({
    where: { userId_clientRequestKey: { userId, clientRequestKey } },
    include: ticketInclude,
  });
const createTicket = (data, client = prisma) =>
  client.supportTicket.create({ data });
const createMessage = (data, client = prisma) =>
  client.supportMessage.create({
    data,
    include: { sender: { select: { id: true, fullName: true, role: true } } },
  });
const findMessageByClientKey = (senderId, clientMessageKey, client = prisma) =>
  client.supportMessage.findUnique({
    where: { senderId_clientMessageKey: { senderId, clientMessageKey } },
    include: { sender: { select: { id: true, fullName: true, role: true } } },
  });
const findTicket = (id, client = prisma) =>
  client.supportTicket.findUnique({ where: { id }, include: ticketInclude });
const listForUser = ({ userId, status, skip, take }) =>
  prisma.supportTicket.findMany({
    where: { userId, ...(status ? { status } : {}) },
    include: { messages: { orderBy: { createdAt: "desc" }, take: 1 } },
    orderBy: { updatedAt: "desc" },
    skip,
    take,
  });
const countForUser = (userId, status) =>
  prisma.supportTicket.count({
    where: { userId, ...(status ? { status } : {}) },
  });
const listForAdmin = ({ status, skip, take }) =>
  prisma.supportTicket.findMany({
    where: status ? { status } : {},
    include: {
      user: { select: { id: true, fullName: true, phone: true } },
      messages: { orderBy: { createdAt: "desc" }, take: 1 },
    },
    orderBy: [{ priority: "desc" }, { updatedAt: "desc" }],
    skip,
    take,
  });
const countForAdmin = (status) =>
  prisma.supportTicket.count({ where: status ? { status } : {} });
const updateTicket = (id, data, client = prisma) =>
  client.supportTicket.update({ where: { id }, data, include: ticketInclude });
module.exports = {
  transaction,
  findByClientKey,
  createTicket,
  createMessage,
  findMessageByClientKey,
  findTicket,
  listForUser,
  countForUser,
  listForAdmin,
  countForAdmin,
  updateTicket,
};
