ALTER TYPE "InvoiceStatus" ADD VALUE IF NOT EXISTS 'PENDING_VERIFICATION' BEFORE 'PAID';
ALTER TYPE "PaymentProvider" ADD VALUE IF NOT EXISTS 'BANK_TRANSFER';
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'BANK_TRANSFER';

ALTER TABLE "payment_invoices"
  ADD COLUMN "reference_code" VARCHAR(40),
  ADD COLUMN "transfer_receipt_path" VARCHAR(500),
  ADD COLUMN "rejection_notes" VARCHAR(500),
  ADD COLUMN "reviewed_at" TIMESTAMPTZ(6),
  ADD COLUMN "reviewed_by_admin_id" UUID;

CREATE UNIQUE INDEX "payment_invoices_reference_code_key" ON "payment_invoices"("reference_code");
CREATE INDEX "payment_invoices_payment_method_status_created_at_idx" ON "payment_invoices"("payment_method", "status", "created_at");