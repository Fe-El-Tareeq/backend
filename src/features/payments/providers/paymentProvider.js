class PaymentProvider {
  createPayment() {
    throw new Error(
      "createPayment must be implemented by the payment provider.",
    );
  }

  verifyWebhookSignature() {
    throw new Error(
      "verifyWebhookSignature must be implemented by the payment provider.",
    );
  }
}

module.exports = PaymentProvider;
