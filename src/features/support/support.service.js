const { randomUUID } = require("crypto");
const ApiError = require("../../utils/ApiError");
const repository = require("./support.repository");
const emailService = require("../../services/email.service");

const isAdmin = (user) => user.role === "SUPER_ADMIN";
const assertAccess = (ticket, user) => {
  if (!ticket) throw new ApiError(404, "Support ticket not found.");
  if (ticket.userId !== user.id && !isAdmin(user))
    throw new ApiError(404, "Support ticket not found.");
};
const config = () => ({
  isAvailable: true,
  availableAgents: 3,
  averageResponseMinutes: 5,
  phone: process.env.SUPPORT_PHONE || "059992735",
  email: process.env.SUPPORT_EMAIL || "support@wasel.ps",
  workingHours: { days: "SUNDAY_THURSDAY", from: "09:00", to: "17:00" },
});
const create = async (user, payload) => {
  const existing = await repository.findByClientKey(
    user.id,
    payload.clientRequestKey,
  );
  if (existing) return { created: false, ticket: existing };
  const result = await repository.transaction(async (tx) => {
    const ticket = await repository.createTicket(
      {
        id: randomUUID(),
        ticketCode: `TKT-${randomUUID().slice(0, 6).toUpperCase()}`,
        userId: user.id,
        clientRequestKey: payload.clientRequestKey,
        category: payload.category,
        priority: payload.category === "PAYMENT_ISSUE" ? "HIGH" : "NORMAL",
      },
      tx,
    );
    await repository.createMessage(
      {
        ticketId: ticket.id,
        senderId: user.id,
        clientMessageKey: payload.clientMessageKey,
        content: payload.message,
      },
      tx,
    );
    return {
      created: true,
      ticket: await repository.findTicket(ticket.id, tx),
    };
  });
  await emailService
    .sendSupportTicketNotification(result.ticket, user, payload.message)
    .catch((error) => {
      console.error(
        `Failed to email support ticket ${result.ticket.ticketCode}:`,
        error.message,
      );
      return { sent: false, reason: "EMAIL_DELIVERY_FAILED" };
    });
  return result;
};
const listMine = async (user, query) => {
  const [tickets, total] = await Promise.all([
    repository.listForUser({ userId: user.id, ...query }),
    repository.countForUser(user.id, query.status),
  ]);
  return { tickets, pagination: { ...query, total } };
};
const get = async (user, id) => {
  const ticket = await repository.findTicket(id);
  assertAccess(ticket, user);
  return { ticket };
};
const sendMessage = async (user, id, payload) => {
  const ticket = await repository.findTicket(id);
  assertAccess(ticket, user);
  if (["RESOLVED", "CLOSED"].includes(ticket.status))
    throw new ApiError(409, "Closed support tickets cannot receive messages.");
  const existing = await repository.findMessageByClientKey(
    user.id,
    payload.clientMessageKey,
  );
  if (existing) return { created: false, message: existing };
  const message = await repository.createMessage({
    ticketId: id,
    senderId: user.id,
    clientMessageKey: payload.clientMessageKey,
    content: payload.message,
  });
  if (isAdmin(user))
    await repository.updateTicket(id, {
      assignedAdminId: ticket.assignedAdminId || user.id,
      status: "WAITING_FOR_USER",
    });
  else if (ticket.status === "WAITING_FOR_USER")
    await repository.updateTicket(id, { status: "IN_PROGRESS" });
  return { created: true, message };
};
const listAdmin = async (user, query) => {
  if (!isAdmin(user))
    throw new ApiError(403, "Administrator access is required.");
  const [tickets, total] = await Promise.all([
    repository.listForAdmin(query),
    repository.countForAdmin(query.status),
  ]);
  return { tickets, pagination: { ...query, total } };
};
const updateStatus = async (user, id, status) => {
  if (!isAdmin(user))
    throw new ApiError(403, "Administrator access is required.");
  const ticket = await repository.findTicket(id);
  if (!ticket) throw new ApiError(404, "Support ticket not found.");
  const now = new Date();
  return {
    ticket: await repository.updateTicket(id, {
      status,
      assignedAdminId: ticket.assignedAdminId || user.id,
      resolvedAt: status === "RESOLVED" ? now : ticket.resolvedAt,
      closedAt: status === "CLOSED" ? now : ticket.closedAt,
    }),
  };
};
module.exports = {
  config,
  create,
  listMine,
  get,
  sendMessage,
  listAdmin,
  updateStatus,
};
