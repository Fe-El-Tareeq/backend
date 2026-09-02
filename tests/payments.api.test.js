process.env.NODE_ENV = "test";

jest.mock("../src/features/payments/payments.service");
jest.mock("../src/middleware/auth.middleware", () => ({
  requireAuth: (req, res, next) => {
    req.user = { id: "550e8400-e29b-41d4-a716-446655440001" };
    next();
  },
}));

const request = require("supertest");
const app = require("../src/app");
const service = require("../src/features/payments/payments.service");

const userId = "550e8400-e29b-41d4-a716-446655440001";
const packageId = "650e8400-e29b-41d4-a716-446655440001";
const invoiceId = "750e8400-e29b-41d4-a716-446655440001";
const clientRequestKey = "850e8400-e29b-41d4-a716-446655440001";

beforeEach(() => jest.clearAllMocks());

test("GET /payments/packages lists token packages", async () => {
  service.listPackages.mockResolvedValue([]);
  const response = await request(app).get("/api/v1/payments/packages");
  expect(response.statusCode).toBe(200);
  expect(service.listPackages).toHaveBeenCalled();
});

test("POST /payments/invoices creates a payment invoice", async () => {
  service.createInvoice.mockResolvedValue({
    created: true,
    invoice: { id: invoiceId },
  });
  const response = await request(app).post("/api/v1/payments/invoices").send({
    tokenPackageId: packageId,
    clientRequestKey,
  });
  expect(response.statusCode).toBe(201);
  expect(service.createInvoice).toHaveBeenCalledWith(userId, {
    tokenPackageId: packageId,
    clientRequestKey,
  });
});

test("invoice payload validation rejects unknown and invalid fields", async () => {
  const response = await request(app).post("/api/v1/payments/invoices").send({
    tokenPackageId: "not-a-uuid",
    clientRequestKey,
    amountNis: 1,
  });
  expect(response.statusCode).toBe(400);
  expect(service.createInvoice).not.toHaveBeenCalled();
});

test("GET invoice and list endpoints forward ownership and pagination", async () => {
  service.getInvoice.mockResolvedValue({ id: invoiceId });
  service.listInvoices.mockResolvedValue({
    invoices: [],
    pagination: { skip: 2, take: 5, total: 0 },
  });
  expect(
    (await request(app).get(`/api/v1/payments/invoices/${invoiceId}`))
      .statusCode,
  ).toBe(200);
  expect(
    (
      await request(app).get(
        "/api/v1/payments/invoices?status=PAID&skip=2&take=5",
      )
    ).statusCode,
  ).toBe(200);
  expect(service.getInvoice).toHaveBeenCalledWith(userId, invoiceId);
  expect(service.listInvoices).toHaveBeenCalledWith(userId, {
    status: "PAID",
    skip: 2,
    take: 5,
  });
});

test("POST mock pay forwards only the authenticated user's invoice", async () => {
  service.simulateMockPayment.mockResolvedValue({ processed: true });
  const response = await request(app).post(
    `/api/v1/payments/mock/invoices/${invoiceId}/pay`,
  );
  expect(response.statusCode).toBe(200);
  expect(service.simulateMockPayment).toHaveBeenCalledWith(userId, invoiceId);
});

test("public mock webhook forwards the signature and validated payload", async () => {
  const body = {
    providerInvoiceId: "mock-invoice-1",
    providerTransactionId: "mock-transaction-1",
    status: "SUCCESS",
    amountPaidNis: 12,
    providerTimestamp: "2026-09-03T10:00:00.000Z",
  };
  service.processMockWebhook.mockResolvedValue({ processed: true });
  const response = await request(app)
    .post("/api/v1/payments/webhooks/mock")
    .set("x-payment-signature", "a".repeat(64))
    .send(body);
  expect(response.statusCode).toBe(200);
  expect(service.processMockWebhook).toHaveBeenCalledWith(body, "a".repeat(64));
});
