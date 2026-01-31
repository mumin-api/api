/*
  Warnings:

  - You are about to drop the column `balance` on the `api_keys` table. All the data in the column will be lost.
  - Made the column `user_id` on table `api_keys` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "api_keys" DROP COLUMN "balance",
ALTER COLUMN "user_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "email_logs" ALTER COLUMN "user_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "cookie_consent" JSONB,
ADD COLUMN     "email_verified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "email_verified_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "verification_codes" (
    "id" SERIAL NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "code" VARCHAR(60) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 3,
    "used_at" TIMESTAMP(3),
    "user_id" INTEGER,

    CONSTRAINT "verification_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_logs" (
    "id" SERIAL NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "action" VARCHAR(50) NOT NULL,
    "ip_address" VARCHAR(45),
    "user_agent" TEXT,
    "success" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id" INTEGER,

    CONSTRAINT "verification_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "verification_codes_email_expires_at_idx" ON "verification_codes"("email", "expires_at");

-- CreateIndex
CREATE INDEX "verification_logs_email_created_at_idx" ON "verification_logs"("email", "created_at");

-- CreateIndex
CREATE INDEX "verification_logs_ip_address_created_at_idx" ON "verification_logs"("ip_address", "created_at");

-- AddForeignKey
ALTER TABLE "verification_codes" ADD CONSTRAINT "verification_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_logs" ADD CONSTRAINT "verification_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
