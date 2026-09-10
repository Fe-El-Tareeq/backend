CREATE TYPE "ProposalType" AS ENUM ('TRAVELER_OFFER', 'REQUESTER_REQUEST');
CREATE TYPE "ProposalStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'WITHDRAWN', 'EXPIRED');
CREATE TYPE "ProposalRejectionReason" AS ENUM ('REJECTED_BY_OWNER', 'ANOTHER_PROPOSAL_ACCEPTED', 'TRIP_CAPACITY_FULL');
ALTER TYPE "AcceptanceSource" ADD VALUE 'PROPOSAL';

CREATE TABLE "proposals" (
    "id" UUID NOT NULL,
    "errand_id" UUID NOT NULL,
    "trip_id" UUID NOT NULL,
    "initiated_by_id" UUID NOT NULL,
    "assignment_id" UUID,
    "client_request_key" UUID NOT NULL,
    "type" "ProposalType" NOT NULL,
    "status" "ProposalStatus" NOT NULL DEFAULT 'PENDING',
    "message" VARCHAR(500),
    "rejection_reason" "ProposalRejectionReason",
    "accepted_at" TIMESTAMPTZ(6),
    "rejected_at" TIMESTAMPTZ(6),
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "proposals_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "proposals_initiated_by_id_client_request_key_key" ON "proposals"("initiated_by_id", "client_request_key");
CREATE UNIQUE INDEX "proposals_assignment_id_key" ON "proposals"("assignment_id");
CREATE UNIQUE INDEX "proposals_errand_id_trip_id_type_key" ON "proposals"("errand_id", "trip_id", "type");
CREATE INDEX "proposals_errand_id_status_created_at_idx" ON "proposals"("errand_id", "status", "created_at");
CREATE INDEX "proposals_trip_id_status_created_at_idx" ON "proposals"("trip_id", "status", "created_at");
CREATE INDEX "proposals_initiated_by_id_idx" ON "proposals"("initiated_by_id");
CREATE INDEX "proposals_expires_at_status_idx" ON "proposals"("expires_at", "status");

ALTER TABLE "proposals" ADD CONSTRAINT "proposals_errand_id_fkey" FOREIGN KEY ("errand_id") REFERENCES "errands"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_initiated_by_id_fkey" FOREIGN KEY ("initiated_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "errand_assignments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
