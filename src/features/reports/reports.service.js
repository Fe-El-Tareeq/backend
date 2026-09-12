const { randomUUID } = require("crypto");
const ApiError = require("../../utils/ApiError");
const repository = require("./reports.repository");
const { priorityFor } = require("./reports.constants");
const emailService = require("../../services/email.service");
const admin = (user) => user.role === "SUPER_ADMIN";
const create = async (user, payload) => {
  if (payload.reportedUserId === user.id)
    throw new ApiError(400, "Users cannot report themselves.");
  const existing = await repository.findByClientKey(
    user.id,
    payload.clientRequestKey,
  );
  if (existing) return { created: false, report: existing };
  const report = await repository.create({
    id: randomUUID(),
    reportCode: `RPT-${randomUUID().slice(0, 6).toUpperCase()}`,
    reporterId: user.id,
    ...payload,
    priority: priorityFor(payload.type),
  });
  await emailService.sendReportNotification(report, user).catch((error) => {
    console.error(`Failed to email report ${report.reportCode}:`, error.message);
    return { sent: false, reason: "EMAIL_DELIVERY_FAILED" };
  });
  return { created: true, report };
};
const listMine = async (user, query) => {
  const [reports, total] = await Promise.all([
    repository.listMine({ reporterId: user.id, ...query }),
    repository.countMine(user.id, query.status),
  ]);
  return { reports, pagination: { ...query, total } };
};
const get = async (user, id) => {
  const report = await repository.findById(id);
  if (!report || (report.reporterId !== user.id && !admin(user)))
    throw new ApiError(404, "Report not found.");
  return { report };
};
const listAdmin = async (user, query) => {
  if (!admin(user))
    throw new ApiError(403, "Administrator access is required.");
  const [reports, total] = await Promise.all([
    repository.listAdmin(query),
    repository.countAdmin(query.status),
  ]);
  return { reports, pagination: { ...query, total } };
};
const update = async (user, id, payload) => {
  if (!admin(user))
    throw new ApiError(403, "Administrator access is required.");
  if (!(await repository.findById(id)))
    throw new ApiError(404, "Report not found.");
  return {
    report: await repository.update(id, {
      ...payload,
      resolvedAt: ["RESOLVED", "REJECTED"].includes(payload.status)
        ? new Date()
        : null,
    }),
  };
};
module.exports = { create, listMine, get, listAdmin, update };
