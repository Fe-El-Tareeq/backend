CREATE TYPE "ItemSize" AS ENUM ('ENVELOPE', 'SMALL', 'MEDIUM', 'LARGE');

ALTER TABLE "errands"
ADD COLUMN "cancellation_reason" VARCHAR(255);

CREATE TABLE "errand_items" (
    "id" UUID NOT NULL,
    "errand_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" TEXT,
    "quantity" INTEGER NOT NULL,
    "size" "ItemSize" NOT NULL,
    "is_urgent" BOOLEAN NOT NULL DEFAULT false,
    "item_note" VARCHAR(500),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "errand_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "errand_items_quantity_check" CHECK ("quantity" >= 1)
);

CREATE INDEX "errand_items_errand_id_idx" ON "errand_items"("errand_id");
CREATE INDEX "errand_items_category_id_idx" ON "errand_items"("category_id");

CREATE TABLE "errand_images" (
    "id" UUID NOT NULL,
    "errand_id" UUID NOT NULL,
    "image_url" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "errand_images_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "errand_images_position_check" CHECK ("position" >= 0)
);

CREATE UNIQUE INDEX "errand_images_errand_id_position_key"
ON "errand_images"("errand_id", "position");
CREATE INDEX "errand_images_errand_id_idx" ON "errand_images"("errand_id");

ALTER TABLE "errand_items"
ADD CONSTRAINT "errand_items_errand_id_fkey"
FOREIGN KEY ("errand_id") REFERENCES "errands"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "errand_items"
ADD CONSTRAINT "errand_items_category_id_fkey"
FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "errand_images"
ADD CONSTRAINT "errand_images_errand_id_fkey"
FOREIGN KEY ("errand_id") REFERENCES "errands"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Add the product categories required by the multi-item request form while
-- preserving every existing category and identifier.
INSERT INTO "categories" (
    "id",
    "name",
    "priority_weight",
    "icon",
    "is_active",
    "created_at"
)
VALUES
    (gen_random_uuid(), 'Parcel', 3, 'parcel', true, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'Clothes', 2, 'clothes', true, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'Household Supplies', 3, 'household-supplies', true, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'Electronics', 2, 'electronics', true, CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO UPDATE SET
    "priority_weight" = EXCLUDED."priority_weight",
    "icon" = EXCLUDED."icon",
    "is_active" = true;

-- Preserve existing production errands as one-item requests. Legacy aggregate
-- columns remain during this compatibility phase because matching and assignment
-- logic still consume them.
INSERT INTO "errand_items" (
    "id",
    "errand_id",
    "category_id",
    "name",
    "description",
    "quantity",
    "size",
    "is_urgent",
    "item_note",
    "created_at",
    "updated_at"
)
SELECT
    gen_random_uuid(),
    "id",
    "category_id",
    "title",
    "items_description",
    1,
    CASE "weight_class"
      WHEN 'LIGHT' THEN 'SMALL'::"ItemSize"
      WHEN 'MEDIUM' THEN 'MEDIUM'::"ItemSize"
      WHEN 'HEAVY' THEN 'LARGE'::"ItemSize"
    END,
    "is_urgent",
    NULL,
    "created_at",
    "updated_at"
FROM "errands"
WHERE "category_id" IS NOT NULL;
