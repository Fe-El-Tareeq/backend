CREATE TYPE "SupportTicketCategory" AS ENUM ('PAYMENT_ISSUE', 'OPEN_REQUEST', 'CANCEL_REQUEST', 'GENERAL_INQUIRY');
CREATE TYPE "SupportTicketStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'WAITING_FOR_USER', 'RESOLVED', 'CLOSED');
CREATE TYPE "SupportTicketPriority" AS ENUM ('NORMAL', 'HIGH');

CREATE TABLE "support_tickets" (
  "id" UUID NOT NULL,
  "ticket_code" VARCHAR(20) NOT NULL,
  "user_id" UUID NOT NULL,
  "assigned_admin_id" UUID,
  "client_request_key" UUID NOT NULL,
  "category" "SupportTicketCategory" NOT NULL,
  "status" "SupportTicketStatus" NOT NULL DEFAULT 'OPEN',
  "priority" "SupportTicketPriority" NOT NULL DEFAULT 'NORMAL',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  "resolved_at" TIMESTAMPTZ(6),
  "closed_at" TIMESTAMPTZ(6),
  CONSTRAINT "support_tickets_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "support_messages" (
  "id" UUID NOT NULL,
  "ticket_id" UUID NOT NULL,
  "sender_id" UUID NOT NULL,
  "client_message_key" UUID NOT NULL,
  "content" VARCHAR(1000) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "support_messages_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "support_tickets_ticket_code_key" ON "support_tickets"("ticket_code");
CREATE UNIQUE INDEX "support_tickets_user_id_client_request_key_key" ON "support_tickets"("user_id", "client_request_key");
CREATE INDEX "support_tickets_user_id_status_updated_at_idx" ON "support_tickets"("user_id", "status", "updated_at");
CREATE INDEX "support_tickets_assigned_admin_id_status_idx" ON "support_tickets"("assigned_admin_id", "status");
CREATE INDEX "support_tickets_status_priority_created_at_idx" ON "support_tickets"("status", "priority", "created_at");
CREATE UNIQUE INDEX "support_messages_sender_id_client_message_key_key" ON "support_messages"("sender_id", "client_message_key");
CREATE INDEX "support_messages_ticket_id_created_at_idx" ON "support_messages"("ticket_id", "created_at");
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_assigned_admin_id_fkey" FOREIGN KEY ("assigned_admin_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "support_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
