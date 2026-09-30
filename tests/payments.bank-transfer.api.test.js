process.env.NODE_ENV = "test";
process.env.ADMIN_USER_ID = "550e8400-e29b-41d4-a716-446655440001";
process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://test";
process.env.DIRECT_URL = process.env.DIRECT_URL || "postgresql://test";
process.env.JWT_ACCESS_SECRET =
  process.env.JWT_ACCESS_SECRET || "test-access-secret";
process.env.JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET || "test-refresh-secret";
jest.mock("../src/config/prisma", () => ({ user: { findUnique: jest.fn() } }));
jest.mock("../src/features/payments/payments.service");
const request = require("supertest");
const jwt = require("jsonwebtoken");
const app = require("../src/app");
const prisma = require("../src/config/prisma");
const service = require("../src/features/payments/payments.service");
const ApiError = require("../src/utils/ApiError");
const userId = "550e8400-e29b-41d4-a716-446655440001";
const invoiceId = "750e8400-e29b-41d4-a716-446655440001";
const token = jwt.sign(
  { type: "access", userId, role: "SUPER_ADMIN" },
  process.env.JWT_ACCESS_SECRET,
);
const base = "/api/v1/admin/payments/invoices";
beforeEach(() => {
  jest.resetAllMocks();
  prisma.user.findUnique.mockResolvedValue({
    id: userId,
    role: "SUPER_ADMIN",
    status: "ACTIVE",
  });
});

test.each(["PENDING_VERIFICATION", "PAID", "FAILED"])(
  "admin filters invoices by %s",
  async (status) => {
    service.listBankTransferInvoices.mockResolvedValue({
      invoices: [{ id: invoiceId, status }],
      pagination: { skip: 2, take: 5, total: 1 },
    });
    const response = await request(app)
      .get(base)
      .set("Authorization", "Bearer " + token)
      .query({ status, skip: 2, take: 5 });
    expect(response.statusCode).toBe(200);
    expect(response.body.data.invoices[0]).toMatchObject({
      id: invoiceId,
      status,
    });
    expect(service.listBankTransferInvoices).toHaveBeenCalledWith({
      status,
      skip: 2,
      take: 5,
    });
  },
);
test.each(["approve", "reject"])(
  "admin can %s with authenticated reviewer identity",
  async (action) => {
    const status = action === "approve" ? "PAID" : "FAILED";
    const method =
      action === "approve"
        ? "approveBankTransferInvoice"
        : "rejectBankTransferInvoice";
    service[method].mockResolvedValue({ id: invoiceId, status });
    const response = await request(app)
      .post(base + "/" + invoiceId + "/" + action)
      .set("Authorization", "Bearer " + token)
      .send(action === "reject" ? { notes: " Incorrect amount " } : {});
    expect(response.statusCode).toBe(200);
    expect(response.body.data.invoice.status).toBe(status);
    expect(service[method]).toHaveBeenCalledWith(
      ...(action === "reject"
        ? [userId, invoiceId, "Incorrect amount"]
        : [userId, invoiceId]),
    );
  },
);
test.each([
  ["get", ""],
  ["post", "/" + invoiceId + "/approve"],
  ["post", "/" + invoiceId + "/reject"],
])(
  "ordinary user cannot %s %s even when JWT claims admin",
  async (method, path) => {
    prisma.user.findUnique.mockResolvedValue({
      id: userId,
      role: "USER",
      status: "ACTIVE",
    });
    const response = await request(app)
      [method](base + path)
      .set("Authorization", "Bearer " + token)
      .send({});
    expect(response.statusCode).toBe(403);
    expect(service.listBankTransferInvoices).not.toHaveBeenCalled();
    expect(service.approveBankTransferInvoice).not.toHaveBeenCalled();
    expect(service.rejectBankTransferInvoice).not.toHaveBeenCalled();
  },
);
test.each([
  {},
  { notes: "" },
  { notes: "  " },
  { notes: "ab" },
  { notes: "x".repeat(501) },
  { notes: "Valid reason", adminId: userId },
])("invalid rejection body %j fails validation", async (body) => {
  const response = await request(app)
    .post(base + "/" + invoiceId + "/reject")
    .set("Authorization", "Bearer " + token)
    .send(body);
  expect(response.statusCode).toBe(400);
  expect(service.rejectBankTransferInvoice).not.toHaveBeenCalled();
});
test.each([404, 409])("review errors preserve HTTP %s", async (statusCode) => {
  service.approveBankTransferInvoice.mockRejectedValue(
    new ApiError(statusCode, "Cannot review invoice"),
  );
  const response = await request(app)
    .post(base + "/" + invoiceId + "/approve")
    .set("Authorization", "Bearer " + token)
    .send({});
  expect(response.statusCode).toBe(statusCode);
});

describe("Receipt upload validation", () => {
  const path = "/api/v1/payments/invoices/" + invoiceId + "/receipt";
  test.each([
    ["pdf", "application/pdf", Buffer.from("%PDF-1.4 test")],
    ["png", "image/png", Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0])],
    ["jpg", "image/jpeg", Buffer.from([255, 216, 255, 0])],
  ])(
    "accepts %s and forwards the authenticated owner",
    async (extension, contentType, buffer) => {
      service.submitBankTransferReceipt.mockResolvedValue({
        id: invoiceId,
        status: "PENDING_VERIFICATION",
      });
      const response = await request(app)
        .post(path)
        .set("Authorization", "Bearer " + token)
        .attach("receipt", buffer, {
          filename: "receipt." + extension,
          contentType,
        });
      expect(response.statusCode).toBe(200);
      expect(service.submitBankTransferReceipt).toHaveBeenCalledWith(
        userId,
        invoiceId,
        expect.objectContaining({ mimetype: contentType, buffer }),
      );
    },
  );
  test.each(["missing", "wrong type", "fake content", "oversized", "multiple"])(
    "rejects %s receipt",
    async (scenario) => {
      let req = request(app)
        .post(path)
        .set("Authorization", "Bearer " + token);
      if (scenario === "wrong type")
        req = req.attach("receipt", Buffer.from("test"), {
          filename: "test.txt",
          contentType: "text/plain",
        });
      if (scenario === "fake content")
        req = req.attach("receipt", Buffer.from("not a PDF"), {
          filename: "test.pdf",
          contentType: "application/pdf",
        });
      if (scenario === "oversized")
        req = req.attach("receipt", Buffer.alloc(5 * 1024 * 1024 + 1), {
          filename: "test.pdf",
          contentType: "application/pdf",
        });
      if (scenario === "multiple")
        req = req
          .attach("receipt", Buffer.from("%PDF-"), "a.pdf")
          .attach("receipt", Buffer.from("%PDF-"), "b.pdf");
      const response = await req;
      expect(response.statusCode).toBe(400);
      expect(service.submitBankTransferReceipt).not.toHaveBeenCalled();
    },
  );
});
