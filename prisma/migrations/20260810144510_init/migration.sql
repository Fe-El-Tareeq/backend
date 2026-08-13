-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'SUPER_ADMIN');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'BANNED');

-- CreateEnum
CREATE TYPE "OtpChannel" AS ENUM ('SMS', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "WeightClass" AS ENUM ('LIGHT', 'MEDIUM', 'HEAVY');

-- CreateEnum
CREATE TYPE "ErrandStatus" AS ENUM ('OPEN', 'MATCHED', 'CANCELLED', 'EXPIRED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "TripStatus" AS ENUM ('ACTIVE', 'CANCELLED', 'EXPIRED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "MatchStatus" AS ENUM ('SUGGESTED', 'DISMISSED', 'ACCEPTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "AcceptanceSource" AS ENUM ('DIRECT', 'TRIP_MATCH');

-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('ACCEPTED', 'PICKED_UP', 'IN_TRANSIT', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MessageType" AS ENUM ('TEXT', 'VOICE');

-- CreateEnum
CREATE TYPE "PaymentModality" AS ENUM ('CASH', 'BARTER');

-- CreateEnum
CREATE TYPE "WalletTransactionType" AS ENUM ('TOKEN_TOP_UP', 'ERRAND_POST_DEBIT', 'TRIP_POST_DEBIT', 'ERRAND_ACCEPT_DEBIT', 'ADMIN_CREDIT', 'ADMIN_DEBIT', 'REFUND');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('JAWWAL_PAY');

-- CreateEnum
CREATE TYPE "PaymentTransactionStatus" AS ENUM ('SUCCESS', 'FAILED');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP', 'SMS', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'READ');

-- CreateEnum
CREATE TYPE "DisputeStatus" AS ENUM ('OPEN', 'UNDER_REVIEW', 'RESOLVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "DisputeResolutionAction" AS ENUM ('NO_ACTION', 'PENALIZE_REQUESTER', 'PENALIZE_TRAVELER', 'REFUND_REQUESTER', 'REFUND_TRAVELER', 'BAN_USER');

-- CreateEnum
CREATE TYPE "OriginType" AS ENUM ('DEFAULT_NEIGHBORHOOD', 'CUSTOM_KEYWORD');

-- CreateEnum
CREATE TYPE "DistanceCategory" AS ENUM ('SAME_NEIGHBORHOOD', 'ADJACENT_ZONE');

-- CreateTable
CREATE TABLE "neighborhoods" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "governorate" VARCHAR(100) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "neighborhoods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "phone" VARCHAR(20) NOT NULL,
    "full_name" VARCHAR(100),
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "trust_score" DECIMAL(5,2) NOT NULL DEFAULT 70.00,
    "neighborhood_id" UUID,
    "profile_completed" BOOLEAN NOT NULL DEFAULT false,
    "phone_verified_at" TIMESTAMPTZ(6),
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "otp_verifications" (
    "id" UUID NOT NULL,
    "phone" VARCHAR(20) NOT NULL,
    "otp_hash" VARCHAR(255) NOT NULL,
    "channel" "OtpChannel" NOT NULL DEFAULT 'SMS',
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 5,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "verified_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "otp_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" VARCHAR(255) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "priority_weight" INTEGER NOT NULL DEFAULT 1,
    "icon" VARCHAR(100),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallets" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_balance" INTEGER NOT NULL DEFAULT 3,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "errands" (
    "id" UUID NOT NULL,
    "requester_id" UUID NOT NULL,
    "category_id" UUID,
    "neighborhood_id" UUID NOT NULL,
    "client_request_key" UUID NOT NULL,
    "title" VARCHAR(80) NOT NULL,
    "items_description" TEXT NOT NULL,
    "destination_keyword" VARCHAR(150) NOT NULL,
    "weight_class" "WeightClass" NOT NULL,
    "is_urgent" BOOLEAN NOT NULL DEFAULT false,
    "is_inter_zone" BOOLEAN NOT NULL DEFAULT false,
    "priority_score" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "calculated_fee_nis" DECIMAL(5,2) NOT NULL,
    "post_token_cost" INTEGER NOT NULL,
    "post_token_transaction_id" UUID,
    "voice_note_url" TEXT,
    "voice_note_duration_sec" INTEGER,
    "status" "ErrandStatus" NOT NULL DEFAULT 'OPEN',
    "needed_by_time" TIMESTAMPTZ(6),
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "errands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trips" (
    "id" UUID NOT NULL,
    "traveler_id" UUID NOT NULL,
    "neighborhood_id" UUID NOT NULL,
    "destination_keyword" VARCHAR(150) NOT NULL,
    "origin_type" "OriginType" NOT NULL DEFAULT 'DEFAULT_NEIGHBORHOOD',
    "custom_origin_keyword" VARCHAR(150),
    "departure_time" TIMESTAMPTZ(6) NOT NULL,
    "max_capacity_class" "WeightClass" NOT NULL,
    "max_capacity_units" INTEGER NOT NULL,
    "remaining_capacity_units" INTEGER NOT NULL,
    "notes" VARCHAR(120),
    "post_token_cost" INTEGER NOT NULL,
    "post_token_transaction_id" UUID,
    "status" "TripStatus" NOT NULL DEFAULT 'ACTIVE',
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "trips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "matches" (
    "id" UUID NOT NULL,
    "errand_id" UUID NOT NULL,
    "trip_id" UUID NOT NULL,
    "match_score" DECIMAL(8,2) NOT NULL,
    "time_score" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "load_score" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "destination_score" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "urgent_boost" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "trust_penalty" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "distance_category" "DistanceCategory" NOT NULL,
    "estimated_fee_nis" DECIMAL(5,2) NOT NULL,
    "status" "MatchStatus" NOT NULL DEFAULT 'SUGGESTED',
    "matched_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accepted_at" TIMESTAMPTZ(6),
    "expires_at" TIMESTAMPTZ(6),

    CONSTRAINT "matches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "errand_assignments" (
    "id" UUID NOT NULL,
    "errand_id" UUID NOT NULL,
    "traveler_id" UUID NOT NULL,
    "trip_id" UUID,
    "acceptance_source" "AcceptanceSource" NOT NULL,
    "accept_token_transaction_id" UUID NOT NULL,
    "status" "AssignmentStatus" NOT NULL DEFAULT 'ACCEPTED',
    "accepted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "picked_up_at" TIMESTAMPTZ(6),
    "in_transit_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "cancelled_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "cancelled_by_user_id" UUID,
    "cancellation_reason" VARCHAR(255),

    CONSTRAINT "errand_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_rooms" (
    "id" UUID NOT NULL,
    "assignment_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "last_message_at" TIMESTAMPTZ(6),

    CONSTRAINT "chat_rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_messages" (
    "id" UUID NOT NULL,
    "chat_room_id" UUID NOT NULL,
    "sender_id" UUID NOT NULL,
    "client_message_key" UUID NOT NULL,
    "message_type" "MessageType" NOT NULL,
    "content_text" VARCHAR(500),
    "audio_url" TEXT,
    "audio_duration_sec" INTEGER,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "sent_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "read_at" TIMESTAMPTZ(6),
    "expires_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ratings" (
    "id" UUID NOT NULL,
    "assignment_id" UUID NOT NULL,
    "reviewer_id" UUID NOT NULL,
    "reviewed_user_id" UUID NOT NULL,
    "rating_stars" INTEGER NOT NULL,
    "payment_modality_confirmed" "PaymentModality",
    "comments" VARCHAR(500),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ratings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rating_feedback_tags" (
    "id" UUID NOT NULL,
    "rating_id" UUID NOT NULL,
    "tag" VARCHAR(50) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rating_feedback_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "badges" (
    "id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "description" VARCHAR(255),
    "icon" VARCHAR(100),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "badges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_badges" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "badge_id" UUID NOT NULL,
    "awarded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_badges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "token_packages" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "token_amount" INTEGER NOT NULL,
    "bonus_tokens" INTEGER NOT NULL DEFAULT 0,
    "price_nis" DECIMAL(10,2) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "token_packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_invoices" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_package_id" UUID NOT NULL,
    "token_amount" INTEGER NOT NULL,
    "bonus_tokens" INTEGER NOT NULL DEFAULT 0,
    "total_tokens" INTEGER NOT NULL,
    "amount_nis" DECIMAL(10,2) NOT NULL,
    "payment_provider" "PaymentProvider" NOT NULL,
    "provider_invoice_id" VARCHAR(150),
    "qr_code_payload" TEXT NOT NULL,
    "payment_url" TEXT,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "paid_at" TIMESTAMPTZ(6),
    "failed_at" TIMESTAMPTZ(6),

    CONSTRAINT "payment_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_transactions" (
    "id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "provider_transaction_id" VARCHAR(150),
    "provider" "PaymentProvider" NOT NULL,
    "amount_paid_nis" DECIMAL(10,2) NOT NULL,
    "status" "PaymentTransactionStatus" NOT NULL,
    "signature_verified" BOOLEAN NOT NULL DEFAULT false,
    "webhook_payload" JSONB,
    "failure_reason" VARCHAR(255),
    "provider_timestamp" TIMESTAMPTZ(6),
    "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallet_transactions" (
    "id" UUID NOT NULL,
    "wallet_id" UUID NOT NULL,
    "transaction_type" "WalletTransactionType" NOT NULL,
    "token_amount" INTEGER NOT NULL,
    "balance_before" INTEGER NOT NULL,
    "balance_after" INTEGER NOT NULL,
    "reference_type" VARCHAR(30),
    "reference_id" UUID,
    "idempotency_key" VARCHAR(100),
    "description" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payment_invoice_id" UUID,

    CONSTRAINT "wallet_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "disputes" (
    "id" UUID NOT NULL,
    "assignment_id" UUID NOT NULL,
    "opened_by_user_id" UUID NOT NULL,
    "reported_user_id" UUID NOT NULL,
    "admin_id" UUID,
    "reason" VARCHAR(80) NOT NULL,
    "description" TEXT NOT NULL,
    "status" "DisputeStatus" NOT NULL DEFAULT 'OPEN',
    "resolution_action" "DisputeResolutionAction",
    "trust_score_deduction" DECIMAL(5,2),
    "refund_wallet_transaction_id" UUID,
    "admin_notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ(6),

    CONSTRAINT "disputes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "errand_id" UUID,
    "assignment_id" UUID,
    "notification_type" VARCHAR(50) NOT NULL,
    "channel" "NotificationChannel" NOT NULL DEFAULT 'IN_APP',
    "title" VARCHAR(100) NOT NULL,
    "message" VARCHAR(500) NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "provider_message_id" VARCHAR(150),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMPTZ(6),
    "read_at" TIMESTAMPTZ(6),
    "failed_at" TIMESTAMPTZ(6),

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_limit_logs" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "endpoint" VARCHAR(150) NOT NULL,
    "ip_address" VARCHAR(50) NOT NULL,
    "request_count" INTEGER NOT NULL,
    "blocked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rate_limit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_audit_logs" (
    "id" UUID NOT NULL,
    "admin_id" UUID NOT NULL,
    "target_user_id" UUID,
    "action" VARCHAR(80) NOT NULL,
    "entity_type" VARCHAR(50) NOT NULL,
    "entity_id" UUID,
    "old_values" JSONB,
    "new_values" JSONB,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "neighborhoods_name_governorate_key" ON "neighborhoods"("name", "governorate");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE INDEX "users_neighborhood_id_idx" ON "users"("neighborhood_id");

-- CreateIndex
CREATE INDEX "otp_verifications_phone_created_at_idx" ON "otp_verifications"("phone", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "categories_name_key" ON "categories"("name");

-- CreateIndex
CREATE UNIQUE INDEX "wallets_user_id_key" ON "wallets"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "errands_post_token_transaction_id_key" ON "errands"("post_token_transaction_id");

-- CreateIndex
CREATE INDEX "errands_requester_id_idx" ON "errands"("requester_id");

-- CreateIndex
CREATE INDEX "errands_category_id_idx" ON "errands"("category_id");

-- CreateIndex
CREATE INDEX "errands_neighborhood_id_idx" ON "errands"("neighborhood_id");

-- CreateIndex
CREATE INDEX "errands_expires_at_idx" ON "errands"("expires_at");

-- CreateIndex
CREATE INDEX "errands_neighborhood_id_status_is_urgent_created_at_idx" ON "errands"("neighborhood_id", "status", "is_urgent", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "errands_requester_id_client_request_key_key" ON "errands"("requester_id", "client_request_key");

-- CreateIndex
CREATE UNIQUE INDEX "trips_post_token_transaction_id_key" ON "trips"("post_token_transaction_id");

-- CreateIndex
CREATE INDEX "trips_traveler_id_idx" ON "trips"("traveler_id");

-- CreateIndex
CREATE INDEX "trips_neighborhood_id_idx" ON "trips"("neighborhood_id");

-- CreateIndex
CREATE INDEX "trips_departure_time_idx" ON "trips"("departure_time");

-- CreateIndex
CREATE INDEX "trips_status_idx" ON "trips"("status");

-- CreateIndex
CREATE INDEX "trips_expires_at_idx" ON "trips"("expires_at");

-- CreateIndex
CREATE INDEX "matches_errand_id_idx" ON "matches"("errand_id");

-- CreateIndex
CREATE INDEX "matches_trip_id_idx" ON "matches"("trip_id");

-- CreateIndex
CREATE INDEX "matches_status_idx" ON "matches"("status");

-- CreateIndex
CREATE INDEX "matches_match_score_idx" ON "matches"("match_score");

-- CreateIndex
CREATE INDEX "matches_expires_at_idx" ON "matches"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "matches_errand_id_trip_id_key" ON "matches"("errand_id", "trip_id");

-- CreateIndex
CREATE UNIQUE INDEX "errand_assignments_accept_token_transaction_id_key" ON "errand_assignments"("accept_token_transaction_id");

-- CreateIndex
CREATE INDEX "errand_assignments_errand_id_idx" ON "errand_assignments"("errand_id");

-- CreateIndex
CREATE INDEX "errand_assignments_traveler_id_idx" ON "errand_assignments"("traveler_id");

-- CreateIndex
CREATE INDEX "errand_assignments_trip_id_idx" ON "errand_assignments"("trip_id");

-- CreateIndex
CREATE INDEX "errand_assignments_status_idx" ON "errand_assignments"("status");

-- CreateIndex
CREATE UNIQUE INDEX "chat_rooms_assignment_id_key" ON "chat_rooms"("assignment_id");

-- CreateIndex
CREATE INDEX "chat_rooms_last_message_at_idx" ON "chat_rooms"("last_message_at");

-- CreateIndex
CREATE INDEX "chat_messages_chat_room_id_sent_at_idx" ON "chat_messages"("chat_room_id", "sent_at");

-- CreateIndex
CREATE INDEX "chat_messages_sender_id_idx" ON "chat_messages"("sender_id");

-- CreateIndex
CREATE INDEX "chat_messages_expires_at_idx" ON "chat_messages"("expires_at");

-- CreateIndex
CREATE INDEX "chat_messages_chat_room_id_is_read_idx" ON "chat_messages"("chat_room_id", "is_read");

-- CreateIndex
CREATE UNIQUE INDEX "chat_messages_sender_id_client_message_key_key" ON "chat_messages"("sender_id", "client_message_key");

-- CreateIndex
CREATE INDEX "ratings_assignment_id_idx" ON "ratings"("assignment_id");

-- CreateIndex
CREATE INDEX "ratings_reviewer_id_idx" ON "ratings"("reviewer_id");

-- CreateIndex
CREATE INDEX "ratings_reviewed_user_id_idx" ON "ratings"("reviewed_user_id");

-- CreateIndex
CREATE INDEX "ratings_reviewed_user_id_created_at_idx" ON "ratings"("reviewed_user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "ratings_assignment_id_reviewer_id_key" ON "ratings"("assignment_id", "reviewer_id");

-- CreateIndex
CREATE INDEX "rating_feedback_tags_rating_id_idx" ON "rating_feedback_tags"("rating_id");

-- CreateIndex
CREATE UNIQUE INDEX "rating_feedback_tags_rating_id_tag_key" ON "rating_feedback_tags"("rating_id", "tag");

-- CreateIndex
CREATE UNIQUE INDEX "badges_name_key" ON "badges"("name");

-- CreateIndex
CREATE INDEX "user_badges_user_id_idx" ON "user_badges"("user_id");

-- CreateIndex
CREATE INDEX "user_badges_badge_id_idx" ON "user_badges"("badge_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_badges_user_id_badge_id_key" ON "user_badges"("user_id", "badge_id");

-- CreateIndex
CREATE UNIQUE INDEX "token_packages_name_key" ON "token_packages"("name");

-- CreateIndex
CREATE INDEX "token_packages_is_active_idx" ON "token_packages"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "payment_invoices_provider_invoice_id_key" ON "payment_invoices"("provider_invoice_id");

-- CreateIndex
CREATE INDEX "payment_invoices_user_id_idx" ON "payment_invoices"("user_id");

-- CreateIndex
CREATE INDEX "payment_invoices_token_package_id_idx" ON "payment_invoices"("token_package_id");

-- CreateIndex
CREATE INDEX "payment_invoices_status_idx" ON "payment_invoices"("status");

-- CreateIndex
CREATE INDEX "payment_invoices_expires_at_idx" ON "payment_invoices"("expires_at");

-- CreateIndex
CREATE INDEX "payment_invoices_user_id_status_created_at_idx" ON "payment_invoices"("user_id", "status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "payment_transactions_provider_transaction_id_key" ON "payment_transactions"("provider_transaction_id");

-- CreateIndex
CREATE INDEX "payment_transactions_invoice_id_idx" ON "payment_transactions"("invoice_id");

-- CreateIndex
CREATE INDEX "payment_transactions_status_idx" ON "payment_transactions"("status");

-- CreateIndex
CREATE INDEX "payment_transactions_received_at_idx" ON "payment_transactions"("received_at");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_transactions_idempotency_key_key" ON "wallet_transactions"("idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_transactions_payment_invoice_id_key" ON "wallet_transactions"("payment_invoice_id");

-- CreateIndex
CREATE INDEX "wallet_transactions_wallet_id_idx" ON "wallet_transactions"("wallet_id");

-- CreateIndex
CREATE INDEX "wallet_transactions_transaction_type_idx" ON "wallet_transactions"("transaction_type");

-- CreateIndex
CREATE INDEX "wallet_transactions_reference_type_reference_id_idx" ON "wallet_transactions"("reference_type", "reference_id");

-- CreateIndex
CREATE INDEX "wallet_transactions_wallet_id_created_at_idx" ON "wallet_transactions"("wallet_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "disputes_refund_wallet_transaction_id_key" ON "disputes"("refund_wallet_transaction_id");

-- CreateIndex
CREATE INDEX "disputes_assignment_id_idx" ON "disputes"("assignment_id");

-- CreateIndex
CREATE INDEX "disputes_opened_by_user_id_idx" ON "disputes"("opened_by_user_id");

-- CreateIndex
CREATE INDEX "disputes_reported_user_id_idx" ON "disputes"("reported_user_id");

-- CreateIndex
CREATE INDEX "disputes_admin_id_idx" ON "disputes"("admin_id");

-- CreateIndex
CREATE INDEX "disputes_status_idx" ON "disputes"("status");

-- CreateIndex
CREATE INDEX "disputes_created_at_idx" ON "disputes"("created_at");

-- CreateIndex
CREATE INDEX "notifications_user_id_idx" ON "notifications"("user_id");

-- CreateIndex
CREATE INDEX "notifications_errand_id_idx" ON "notifications"("errand_id");

-- CreateIndex
CREATE INDEX "notifications_assignment_id_idx" ON "notifications"("assignment_id");

-- CreateIndex
CREATE INDEX "notifications_status_idx" ON "notifications"("status");

-- CreateIndex
CREATE INDEX "notifications_user_id_status_created_at_idx" ON "notifications"("user_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "rate_limit_logs_user_id_idx" ON "rate_limit_logs"("user_id");

-- CreateIndex
CREATE INDEX "rate_limit_logs_ip_address_idx" ON "rate_limit_logs"("ip_address");

-- CreateIndex
CREATE INDEX "rate_limit_logs_endpoint_idx" ON "rate_limit_logs"("endpoint");

-- CreateIndex
CREATE INDEX "rate_limit_logs_blocked_at_idx" ON "rate_limit_logs"("blocked_at");

-- CreateIndex
CREATE INDEX "rate_limit_logs_ip_address_endpoint_created_at_idx" ON "rate_limit_logs"("ip_address", "endpoint", "created_at");

-- CreateIndex
CREATE INDEX "admin_audit_logs_admin_id_idx" ON "admin_audit_logs"("admin_id");

-- CreateIndex
CREATE INDEX "admin_audit_logs_target_user_id_idx" ON "admin_audit_logs"("target_user_id");

-- CreateIndex
CREATE INDEX "admin_audit_logs_entity_type_entity_id_idx" ON "admin_audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "admin_audit_logs_created_at_idx" ON "admin_audit_logs"("created_at");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_neighborhood_id_fkey" FOREIGN KEY ("neighborhood_id") REFERENCES "neighborhoods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "errands" ADD CONSTRAINT "errands_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "errands" ADD CONSTRAINT "errands_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "errands" ADD CONSTRAINT "errands_neighborhood_id_fkey" FOREIGN KEY ("neighborhood_id") REFERENCES "neighborhoods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "errands" ADD CONSTRAINT "errands_post_token_transaction_id_fkey" FOREIGN KEY ("post_token_transaction_id") REFERENCES "wallet_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_traveler_id_fkey" FOREIGN KEY ("traveler_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_neighborhood_id_fkey" FOREIGN KEY ("neighborhood_id") REFERENCES "neighborhoods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_post_token_transaction_id_fkey" FOREIGN KEY ("post_token_transaction_id") REFERENCES "wallet_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_errand_id_fkey" FOREIGN KEY ("errand_id") REFERENCES "errands"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "errand_assignments" ADD CONSTRAINT "errand_assignments_errand_id_fkey" FOREIGN KEY ("errand_id") REFERENCES "errands"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "errand_assignments" ADD CONSTRAINT "errand_assignments_traveler_id_fkey" FOREIGN KEY ("traveler_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "errand_assignments" ADD CONSTRAINT "errand_assignments_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "errand_assignments" ADD CONSTRAINT "errand_assignments_cancelled_by_user_id_fkey" FOREIGN KEY ("cancelled_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "errand_assignments" ADD CONSTRAINT "errand_assignments_accept_token_transaction_id_fkey" FOREIGN KEY ("accept_token_transaction_id") REFERENCES "wallet_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_rooms" ADD CONSTRAINT "chat_rooms_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "errand_assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_chat_room_id_fkey" FOREIGN KEY ("chat_room_id") REFERENCES "chat_rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "errand_assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_reviewed_user_id_fkey" FOREIGN KEY ("reviewed_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rating_feedback_tags" ADD CONSTRAINT "rating_feedback_tags_rating_id_fkey" FOREIGN KEY ("rating_id") REFERENCES "ratings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_badges" ADD CONSTRAINT "user_badges_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_badges" ADD CONSTRAINT "user_badges_badge_id_fkey" FOREIGN KEY ("badge_id") REFERENCES "badges"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_invoices" ADD CONSTRAINT "payment_invoices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_invoices" ADD CONSTRAINT "payment_invoices_token_package_id_fkey" FOREIGN KEY ("token_package_id") REFERENCES "token_packages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "payment_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_payment_invoice_id_fkey" FOREIGN KEY ("payment_invoice_id") REFERENCES "payment_invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "errand_assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_opened_by_user_id_fkey" FOREIGN KEY ("opened_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_reported_user_id_fkey" FOREIGN KEY ("reported_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_refund_wallet_transaction_id_fkey" FOREIGN KEY ("refund_wallet_transaction_id") REFERENCES "wallet_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_errand_id_fkey" FOREIGN KEY ("errand_id") REFERENCES "errands"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "errand_assignments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rate_limit_logs" ADD CONSTRAINT "rate_limit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_audit_logs" ADD CONSTRAINT "admin_audit_logs_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_audit_logs" ADD CONSTRAINT "admin_audit_logs_target_user_id_fkey" FOREIGN KEY ("target_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
