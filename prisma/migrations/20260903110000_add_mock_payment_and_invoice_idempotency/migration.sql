-- Add the mock provider used only by local and staging payment flows.
ALTER TYPE "PaymentProvider" ADD VALUE IF NOT EXISTS 'MOCK';

-- Keep this nullable so existing invoices remain valid. New Phase 11 API
-- requests always provide a UUID client request key.
ALTER TABLE "payment_invoices"
ADD COLUMN "client_request_key" UUID;

-- A retried create-invoice request by the same user resolves to one invoice.
CREATE UNIQUE INDEX "payment_invoices_user_id_client_request_key_key"
ON "payment_invoices"("user_id", "client_request_key");
