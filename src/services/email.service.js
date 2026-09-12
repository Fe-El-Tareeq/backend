const env = require("../config/env");

const send = async ({ to, subject, text }) => {
  if (!env.resendApiKey || !env.emailFrom || !to) {
    return { sent: false, reason: "EMAIL_NOT_CONFIGURED" };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: env.emailFrom, to: [to], subject, text }),
  });

  if (!response.ok) {
    const responseText = await response.text();
    throw new Error(
      `Email provider rejected the message (${response.status}): ${responseText.slice(0, 300)}`,
    );
  }

  const result = await response.json();
  return { sent: true, providerMessageId: result.id };
};

const sendReportNotification = (report, reporter) =>
  send({
    to: env.reportNotificationEmail,
    subject: `[${report.priority}] New report ${report.reportCode}`,
    text: [
      `Report: ${report.reportCode}`,
      `Type: ${report.type}`,
      `Priority: ${report.priority}`,
      `Reporter ID: ${report.reporterId}`,
      `Reporter phone: ${reporter.phone || "Not available"}`,
      `Reported user ID: ${report.reportedUserId || "Not provided"}`,
      `Assignment ID: ${report.assignmentId || "Not provided"}`,
      `Errand ID: ${report.errandId || "Not provided"}`,
      `Trip ID: ${report.tripId || "Not provided"}`,
      "",
      report.description,
    ].join("\n"),
  });

const sendSupportTicketNotification = (ticket, requester, initialMessage) =>
  send({
    to: env.reportNotificationEmail,
    subject: `[${ticket.priority}] New support ticket ${ticket.ticketCode}`,
    text: [
      `Ticket: ${ticket.ticketCode}`,
      `Category: ${ticket.category}`,
      `Priority: ${ticket.priority}`,
      `Requester ID: ${ticket.userId}`,
      `Requester phone: ${requester.phone || "Not available"}`,
      "",
      initialMessage,
    ].join("\n"),
  });

module.exports = {
  send,
  sendReportNotification,
  sendSupportTicketNotification,
};
