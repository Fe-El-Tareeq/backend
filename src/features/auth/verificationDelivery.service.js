const emailService = require("../../services/email.service");

const PURPOSE_COPY = {
  EMAIL_VERIFICATION: "verify your Btareeqak account",
  PASSWORD_RESET: "reset your Btareeqak password",
  ACCOUNT_REACTIVATION: "reactivate your Btareeqak account",
};

const escapeHtml = (value) =>
  value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[character]);

const sendVerificationCode = async ({ email, code, purpose, expiresInMinutes }) => {
  const action = PURPOSE_COPY[purpose];
  if (!action) {
    throw new Error(`Unsupported verification email purpose: ${purpose}`);
  }

  const safeCode = escapeHtml(code);
  const result = await emailService.send({
    to: email,
    subject: "Your Btareeqak verification code",
    text: [
      "Btareeqak / بطريقك",
      "",
      `Use this code to ${action}: ${code}`,
      `This code expires in ${expiresInMinutes} minutes.`,
      "If you did not request this code, you can ignore this email.",
    ].join("\n"),
    html: [
      "<p><strong>Btareeqak / بطريقك</strong></p>",
      `<p>Use this code to ${action}:</p>`,
      `<p style=\"font-size:24px;font-weight:700;letter-spacing:4px\">${safeCode}</p>`,
      `<p>This code expires in ${expiresInMinutes} minutes.</p>`,
      "<p>If you did not request this code, you can ignore this email.</p>",
    ].join(""),
  });

  if (!result.sent) {
    throw new Error(`Verification email was not sent: ${result.reason}`);
  }

  return result;
};

module.exports = { sendVerificationCode };
