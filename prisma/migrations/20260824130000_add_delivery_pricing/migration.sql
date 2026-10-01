CREATE TYPE "DeliveryPricingRule" AS ENUM ('AREA_OVERRIDE', 'SAME_AREA', 'NEARBY_AREA', 'SAME_ZONE', 'ZONE_RATE');

ALTER TABLE "neighborhoods" ADD COLUMN "key" VARCHAR(80);

ALTER TABLE "errands" ADD COLUMN "destination_neighborhood_id" UUID;

ALTER TABLE "trips"
ADD COLUMN "destination_neighborhood_id" UUID,
ADD COLUMN "delivery_fee_nis" INTEGER,
ADD COLUMN "pricing_rule" "DeliveryPricingRule",
ADD COLUMN "pricing_version" INTEGER;

ALTER TABLE "errand_assignments"
ADD COLUMN "agreed_delivery_fee_nis" INTEGER,
ADD COLUMN "pricing_version" INTEGER;

CREATE UNIQUE INDEX "neighborhoods_key_key" ON "neighborhoods"("key");
CREATE INDEX "errands_destination_neighborhood_id_idx" ON "errands"("destination_neighborhood_id");
CREATE INDEX "trips_destination_neighborhood_id_idx" ON "trips"("destination_neighborhood_id");

ALTER TABLE "errands" ADD CONSTRAINT "errands_destination_neighborhood_id_fkey"
FOREIGN KEY ("destination_neighborhood_id") REFERENCES "neighborhoods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "trips" ADD CONSTRAINT "trips_destination_neighborhood_id_fkey"
FOREIGN KEY ("destination_neighborhood_id") REFERENCES "neighborhoods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "trips" ADD CONSTRAINT "trips_delivery_fee_range"
CHECK ("delivery_fee_nis" IS NULL OR "delivery_fee_nis" BETWEEN 2 AND 15);

ALTER TABLE "trips" ADD CONSTRAINT "trips_pricing_version_positive"
CHECK ("pricing_version" IS NULL OR "pricing_version" > 0);

ALTER TABLE "errand_assignments" ADD CONSTRAINT "assignments_delivery_fee_range"
CHECK ("agreed_delivery_fee_nis" IS NULL OR "agreed_delivery_fee_nis" BETWEEN 2 AND 15);
