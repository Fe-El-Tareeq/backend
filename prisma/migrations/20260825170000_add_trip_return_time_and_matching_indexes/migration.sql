ALTER TABLE "trips"
ADD COLUMN "expected_return_time" TIMESTAMPTZ(6);

CREATE INDEX "trips_neighborhood_id_destination_neighborhood_id_status_expected_return_time_idx"
ON "trips"("neighborhood_id", "destination_neighborhood_id", "status", "expected_return_time");

CREATE INDEX "errands_neighborhood_id_destination_neighborhood_id_status_expires_at_idx"
ON "errands"("neighborhood_id", "destination_neighborhood_id", "status", "expires_at");
