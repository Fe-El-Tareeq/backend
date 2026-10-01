const TYPES = [
  "FRAUD_OR_SCAM",
  "PROHIBITED_OR_DANGEROUS_ITEM",
  "ABUSE_OR_THREAT",
  "FAKE_ACCOUNT",
  "FAILURE_TO_FULFILL",
  "DAMAGED_OR_MISSING_ITEM",
  "TECHNICAL_ISSUE",
  "OTHER",
];
const STATUSES = ["SUBMITTED", "UNDER_REVIEW", "RESOLVED", "REJECTED"];
const priorityFor = (type) =>
  [
    "FRAUD_OR_SCAM",
    "PROHIBITED_OR_DANGEROUS_ITEM",
    "ABUSE_OR_THREAT",
    "FAKE_ACCOUNT",
  ].includes(type)
    ? "HIGH"
    : ["FAILURE_TO_FULFILL", "DAMAGED_OR_MISSING_ITEM"].includes(type)
      ? "MEDIUM"
      : "NORMAL";
module.exports = { TYPES, STATUSES, priorityFor };
