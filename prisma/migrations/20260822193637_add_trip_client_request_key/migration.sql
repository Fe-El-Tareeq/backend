/*
  Warnings:

  - You are about to drop the column `post_token_cost` on the `trips` table. All the data in the column will be lost.
  - You are about to drop the column `post_token_transaction_id` on the `trips` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[traveler_id,client_request_key]` on the table `trips` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `client_request_key` to the `trips` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "trips" DROP CONSTRAINT "trips_post_token_transaction_id_fkey";

-- DropIndex
DROP INDEX "trips_post_token_transaction_id_key";

-- AlterTable
ALTER TABLE "trips" DROP COLUMN "post_token_cost",
DROP COLUMN "post_token_transaction_id",
ADD COLUMN     "client_request_key" UUID NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "trips_traveler_id_client_request_key_key" ON "trips"("traveler_id", "client_request_key");
