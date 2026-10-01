-- =========================================================
-- Betareeqak - Business Database Constraints
-- =========================================================

-- 1. Wallet: token balance cannot be negative
ALTER TABLE "wallets"
ADD CONSTRAINT "wallets_token_balance_non_negative"
CHECK ("token_balance" >= 0);


-- 2. User: trust score must be between 0 and 100
ALTER TABLE "users"
ADD CONSTRAINT "users_trust_score_range"
CHECK ("trust_score" >= 0 AND "trust_score" <= 100);


-- 3. OTP: attempts must be valid
ALTER TABLE "otp_verifications"
ADD CONSTRAINT "otp_attempt_count_valid"
CHECK (
    "attempt_count" >= 0
    AND "max_attempts" > 0
    AND "attempt_count" <= "max_attempts"
);


-- 4. Errand: fee cannot be negative
ALTER TABLE "errands"
ADD CONSTRAINT "errands_fee_non_negative"
CHECK ("calculated_fee_nis" >= 0);


-- 5. Errand: posting token cost must be positive
ALTER TABLE "errands"
ADD CONSTRAINT "errands_post_token_cost_positive"
CHECK ("post_token_cost" > 0);


-- 6. Errand: voice note maximum 30 seconds
ALTER TABLE "errands"
ADD CONSTRAINT "errands_voice_duration_valid"
CHECK (
    "voice_note_duration_sec" IS NULL
    OR (
        "voice_note_duration_sec" >= 0
        AND "voice_note_duration_sec" <= 30
    )
);


-- 7. Trip: maximum capacity must be positive
ALTER TABLE "trips"
ADD CONSTRAINT "trips_max_capacity_positive"
CHECK ("max_capacity_units" > 0);


-- 8. Trip: remaining capacity must be valid
ALTER TABLE "trips"
ADD CONSTRAINT "trips_remaining_capacity_valid"
CHECK (
    "remaining_capacity_units" >= 0
    AND "remaining_capacity_units" <= "max_capacity_units"
);


-- 9. Trip: posting token cost must be positive
ALTER TABLE "trips"
ADD CONSTRAINT "trips_post_token_cost_positive"
CHECK ("post_token_cost" > 0);


-- 10. Match: estimated fee cannot be negative
ALTER TABLE "matches"
ADD CONSTRAINT "matches_estimated_fee_non_negative"
CHECK ("estimated_fee_nis" >= 0);


-- 11. Assignment:
-- Only one active assignment is allowed for the same errand
CREATE UNIQUE INDEX "one_active_assignment_per_errand"
ON "errand_assignments" ("errand_id")
WHERE "status" IN ('ACCEPTED', 'PICKED_UP', 'IN_TRANSIT');


-- 12. Chat:
-- TEXT message requires text.
-- VOICE message requires an audio URL.
ALTER TABLE "chat_messages"
ADD CONSTRAINT "chat_message_content_valid"
CHECK (
    (
        "message_type" = 'TEXT'
        AND "content_text" IS NOT NULL
        AND "audio_url" IS NULL
    )
    OR
    (
        "message_type" = 'VOICE'
        AND "audio_url" IS NOT NULL
    )
);


-- 13. Chat: voice message maximum 30 seconds
ALTER TABLE "chat_messages"
ADD CONSTRAINT "chat_audio_duration_valid"
CHECK (
    "audio_duration_sec" IS NULL
    OR (
        "audio_duration_sec" >= 0
        AND "audio_duration_sec" <= 30
    )
);


-- 14. Rating must be between 1 and 5
ALTER TABLE "ratings"
ADD CONSTRAINT "ratings_stars_range"
CHECK ("rating_stars" BETWEEN 1 AND 5);


-- 15. Token package: token amount must be positive
ALTER TABLE "token_packages"
ADD CONSTRAINT "token_packages_token_amount_positive"
CHECK ("token_amount" > 0);


-- 16. Token package: bonus cannot be negative
ALTER TABLE "token_packages"
ADD CONSTRAINT "token_packages_bonus_non_negative"
CHECK ("bonus_tokens" >= 0);


-- 17. Token package: price must be positive
ALTER TABLE "token_packages"
ADD CONSTRAINT "token_packages_price_positive"
CHECK ("price_nis" > 0);


-- 18. Payment invoice: amount cannot be negative
ALTER TABLE "payment_invoices"
ADD CONSTRAINT "payment_invoices_amount_non_negative"
CHECK ("amount_nis" >= 0);


-- 19. Payment invoice:
-- total_tokens must equal token_amount + bonus_tokens
ALTER TABLE "payment_invoices"
ADD CONSTRAINT "payment_invoices_tokens_valid"
CHECK (
    "token_amount" > 0
    AND "bonus_tokens" >= 0
    AND "total_tokens" = "token_amount" + "bonus_tokens"
);


-- 20. Payment transaction: paid amount cannot be negative
ALTER TABLE "payment_transactions"
ADD CONSTRAINT "payment_transactions_amount_non_negative"
CHECK ("amount_paid_nis" >= 0);


-- 21. Wallet transaction:
-- balances before and after transaction cannot be negative
ALTER TABLE "wallet_transactions"
ADD CONSTRAINT "wallet_transactions_balance_non_negative"
CHECK (
    "balance_before" >= 0
    AND "balance_after" >= 0
);


-- 22. Dispute: trust score deduction must be between 0 and 100
ALTER TABLE "disputes"
ADD CONSTRAINT "disputes_trust_score_deduction_valid"
CHECK (
    "trust_score_deduction" IS NULL
    OR (
        "trust_score_deduction" >= 0
        AND "trust_score_deduction" <= 100
    )
);


-- 23. Rate limit: request count cannot be negative
ALTER TABLE "rate_limit_logs"
ADD CONSTRAINT "rate_limit_request_count_non_negative"
CHECK ("request_count" >= 0);