ALTER TABLE "users"
ADD COLUMN "deletion_requested_at" TIMESTAMPTZ(6),
ADD COLUMN "deletion_scheduled_at" TIMESTAMPTZ(6);

CREATE INDEX "users_status_deletion_scheduled_at_idx"
ON "users"("status", "deletion_scheduled_at");

ALTER TABLE "errands" DROP CONSTRAINT "errands_requester_id_fkey";
ALTER TABLE "errands" ADD CONSTRAINT "errands_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "trips" DROP CONSTRAINT "trips_traveler_id_fkey";
ALTER TABLE "trips" ADD CONSTRAINT "trips_traveler_id_fkey" FOREIGN KEY ("traveler_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "errand_assignments" DROP CONSTRAINT "errand_assignments_traveler_id_fkey";
ALTER TABLE "errand_assignments" ADD CONSTRAINT "errand_assignments_traveler_id_fkey" FOREIGN KEY ("traveler_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payment_invoices" DROP CONSTRAINT "payment_invoices_user_id_fkey";
ALTER TABLE "payment_invoices" ADD CONSTRAINT "payment_invoices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "disputes" DROP CONSTRAINT "disputes_opened_by_user_id_fkey";
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_opened_by_user_id_fkey" FOREIGN KEY ("opened_by_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "disputes" DROP CONSTRAINT "disputes_reported_user_id_fkey";
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_reported_user_id_fkey" FOREIGN KEY ("reported_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "admin_audit_logs" DROP CONSTRAINT "admin_audit_logs_admin_id_fkey";
ALTER TABLE "admin_audit_logs" ADD CONSTRAINT "admin_audit_logs_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "support_messages" DROP CONSTRAINT "support_messages_sender_id_fkey";
ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
