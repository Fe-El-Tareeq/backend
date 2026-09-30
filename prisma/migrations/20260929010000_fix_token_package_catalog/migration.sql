ALTER TABLE "token_packages"
  ADD COLUMN "discount_percentage" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "features" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "savings_text" VARCHAR(255),
  ADD COLUMN "has_search_priority" BOOLEAN NOT NULL DEFAULT false;