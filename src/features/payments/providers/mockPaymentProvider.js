const crypto = require("crypto");

const ApiError = require("../../../utils/ApiError");
const PaymentProvider = require("./paymentProvider");

const stableSerialize = (value) => {
  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(",")}]`;
  }

  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
};

class MockPaymentProvider extends PaymentProvider {
  constructor(secret) {
    super();
    this.secret = secret;
  }

  requireSecret() {
    if (!this.secret) {
      throw new ApiError(503, "Mock payment provider is not configured.");
    }
  }

  createPayment(invoice) {
    const providerInvoiceId = `mock-invoice-${invoice.id}`;
    const query = new URLSearchParams({
      invoiceId: invoice.id,
      providerInvoiceId,
      amountNis: String(invoice.amountNis),
      currency: "NIS",
    });

    return {
      providerInvoiceId,
      qrCodePayload: `feeltareeq://payments/mock?${query.toString()}`,
      paymentUrl: null,
    };
  }

  signWebhook(payload) {
    this.requireSecret();
    return crypto
      .createHmac("sha256", this.secret)
      .update(stableSerialize(payload))
      .digest("hex");
  }

  verifyWebhookSignature(payload, signature) {
    this.requireSecret();

    if (typeof signature !== "string" || !signature) {
      return false;
    }

    const provided = signature.startsWith("sha256=")
      ? signature.slice("sha256=".length)
      : signature;
    const expected = this.signWebhook(payload);

    if (!/^[a-f0-9]{64}$/i.test(provided)) {
      return false;
    }

    return crypto.timingSafeEqual(
      Buffer.from(provided, "hex"),
      Buffer.from(expected, "hex"),
    );
  }

  createSuccessfulWebhook(invoice) {
    const payload = {
      providerInvoiceId: invoice.providerInvoiceId,
      providerTransactionId: `mock-transaction-${crypto.randomUUID()}`,
      status: "SUCCESS",
      amountPaidNis: Number(invoice.amountNis),
      providerTimestamp: new Date().toISOString(),
    };

    return {
      payload,
      signature: this.signWebhook(payload),
    };
  }
}

module.exports = {
  MockPaymentProvider,
  stableSerialize,
};
