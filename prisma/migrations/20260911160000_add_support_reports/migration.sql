CREATE TYPE "SupportReportType" AS ENUM ('FRAUD_OR_SCAM', 'PROHIBITED_OR_DANGEROUS_ITEM', 'ABUSE_OR_THREAT', 'FAKE_ACCOUNT', 'FAILURE_TO_FULFILL', 'DAMAGED_OR_MISSING_ITEM', 'TECHNICAL_ISSUE', 'OTHER');
CREATE TYPE "SupportReportStatus" AS ENUM ('SUBMITTED', 'UNDER_REVIEW', 'RESOLVED', 'REJECTED');
CREATE TYPE "SupportReportPriority" AS ENUM ('NORMAL', 'MEDIUM', 'HIGH');
CREATE TABLE "support_reports" (
  "id" UUID NOT NULL, "report_code" VARCHAR(20) NOT NULL,
  "reporter_id" UUID NOT NULL, "reported_user_id" UUID,
  "assignment_id" UUID, "errand_id" UUID, "trip_id" UUID,
  "client_request_key" UUID NOT NULL, "type" "SupportReportType" NOT NULL,
  "description" VARCHAR(1500) NOT NULL, "priority" "SupportReportPriority" NOT NULL,
  "status" "SupportReportStatus" NOT NULL DEFAULT 'SUBMITTED',
  "admin_notes" VARCHAR(1500), "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL, "resolved_at" TIMESTAMPTZ(6),
  CONSTRAINT "support_reports_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "support_reports_report_code_key" ON "support_reports"("report_code");
CREATE UNIQUE INDEX "support_reports_reporter_id_client_request_key_key" ON "support_reports"("reporter_id", "client_request_key");
CREATE INDEX "support_reports_reporter_id_status_created_at_idx" ON "support_reports"("reporter_id", "status", "created_at");
CREATE INDEX "support_reports_reported_user_id_idx" ON "support_reports"("reported_user_id");
CREATE INDEX "support_reports_assignment_id_idx" ON "support_reports"("assignment_id");
CREATE INDEX "support_reports_errand_id_idx" ON "support_reports"("errand_id");
CREATE INDEX "support_reports_trip_id_idx" ON "support_reports"("trip_id");
CREATE INDEX "support_reports_status_priority_created_at_idx" ON "support_reports"("status", "priority", "created_at");
ALTER TABLE "support_reports" ADD CONSTRAINT "support_reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "support_reports" ADD CONSTRAINT "support_reports_reported_user_id_fkey" FOREIGN KEY ("reported_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "support_reports" ADD CONSTRAINT "support_reports_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "errand_assignments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "support_reports" ADD CONSTRAINT "support_reports_errand_id_fkey" FOREIGN KEY ("errand_id") REFERENCES "errands"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "support_reports" ADD CONSTRAINT "support_reports_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE SET NULL ON UPDATE CASCADE;
