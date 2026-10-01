-- DropIndex
DROP INDEX "wallet_transactions_idempotency_key_key";

-- Scope non-null idempotency keys to a single wallet.
CREATE UNIQUE INDEX "wallet_transactions_wallet_id_idempotency_key_key"
ON "wallet_transactions" ("wallet_id", "idempotency_key")
WHERE "idempotency_key" IS NOT NULL;
