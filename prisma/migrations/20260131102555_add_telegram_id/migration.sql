/*
  Warnings:

  - A unique constraint covering the columns `[telegram_id]` on the table `users` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "invoice_url" VARCHAR(500),
ALTER COLUMN "currency" SET DATA TYPE VARCHAR(10);

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "telegram_id" VARCHAR(50);

-- CreateIndex
CREATE UNIQUE INDEX "users_telegram_id_key" ON "users"("telegram_id");
