const { randomUUID } = require("crypto");
const ApiError = require("../../utils/ApiError");
const repository = require("./support.repository");
const emailService = require("../../services/email.service");
const env = require("../../config/env");

const isAdmin = (user) => user.role === "SUPER_ADMIN";
const assertAccess = (ticket, user) => {
  if (!ticket) throw new ApiError(404, "Support ticket not found.");
  if (ticket.userId !== user.id && !isAdmin(user))
    throw new ApiError(404, "Support ticket not found.");
};
const config = async () => ({
  isAvailable: true,
  availableAgents: 3,
  averageResponseMinutes: 5,
  phone: env.supportPhones[0] || null,
  phones: env.supportPhones,
  email: env.supportEmail,
  workingHours: env.supportWorkingHours,
  faqs: await repository.listActiveFaqs(),
});
const matchesExistingTicketRequest = (ticket, payload) => {
  const firstMessage = ticket.messages?.[0];
  return (
    ticket.category === payload.category &&
    firstMessage?.clientMessageKey === payload.clientMessageKey &&
    firstMessage?.content === payload.message
  );
};
const create = async (user, payload) => {
  let result;
  try {
    result = await repository.transaction(async (tx) => {
      const existing = await repository.findByClientKey(
        user.id,
        payload.clientRequestKey,
        tx,
      );
      if (existing) {
        if (!matchesExistingTicketRequest(existing, payload)) {
          throw new ApiError(
            409,
            "clientRequestKey was already used with different ticket data.",
          );
        }
        return { created: false, ticket: existing };
      }
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
  } catch (error) {
    if (error?.code !== "P2002") throw error;
    const existing = await repository.findByClientKey(
      user.id,
      payload.clientRequestKey,
    );
    if (!existing || !matchesExistingTicketRequest(existing, payload)) {
      throw new ApiError(
        409,
        "An idempotency key was already used with different ticket data.",
      );
    }
    result = { created: false, ticket: existing };
  }
  if (result.created) {
    await emailService
      .sendSupportTicketNotification(result.ticket, user, payload.message)
      .catch((error) => {
        console.error(
          `Failed to email support ticket ${result.ticket.ticketCode}:`,
          error.message,
        );
        return { sent: false, reason: "EMAIL_DELIVERY_FAILED" };
      });
  }
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
