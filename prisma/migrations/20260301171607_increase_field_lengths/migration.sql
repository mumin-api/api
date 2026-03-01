-- DropIndex
DROP INDEX "hadiths_arabic_text_trgm_idx";

-- DropIndex
DROP INDEX "topics_name_arabic_trgm_idx";

-- DropIndex
DROP INDEX "topics_name_english_trgm_idx";

-- DropIndex
DROP INDEX "translations_text_trgm_idx";

-- AlterTable
ALTER TABLE "hadiths" ALTER COLUMN "arabic_narrator" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "translations" ALTER COLUMN "narrator" SET DATA TYPE TEXT,
ALTER COLUMN "grade" SET DATA TYPE TEXT,
ALTER COLUMN "translator" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "low_balance_alert_sent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "low_balance_alerts" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "security_alerts" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "usage_reports" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "bot_analytics" (
    "id" SERIAL NOT NULL,
    "date" DATE NOT NULL,
    "total_users" INTEGER NOT NULL DEFAULT 0,
    "active_users" INTEGER NOT NULL DEFAULT 0,
    "new_users" INTEGER NOT NULL DEFAULT 0,
    "commands_executed" INTEGER NOT NULL DEFAULT 0,
    "hadiths_viewed" INTEGER NOT NULL DEFAULT 0,
    "searches_performed" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "bot_analytics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "favorites" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "hadith_id" INTEGER NOT NULL,
    "collection_slug" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "favorites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "search_history" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "query" TEXT NOT NULL,
    "results_count" INTEGER NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "search_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "telegram_users" (
    "id" SERIAL NOT NULL,
    "telegram_id" BIGINT NOT NULL,
    "username" VARCHAR(255),
    "first_name" VARCHAR(255),
    "last_name" VARCHAR(255),
    "language_code" VARCHAR(5) NOT NULL DEFAULT 'ru',
    "timezone" VARCHAR(50) NOT NULL DEFAULT 'UTC',
    "daily_hadith_time" VARCHAR(5),
    "preferred_collection" VARCHAR(100),
    "is_subscribed" BOOLEAN NOT NULL DEFAULT false,
    "subscribed_at" TIMESTAMP(3),
    "api_key_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_active_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "total_commands" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "telegram_users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bot_analytics_date_key" ON "bot_analytics"("date");

-- CreateIndex
CREATE INDEX "favorites_user_id_idx" ON "favorites"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "favorites_user_id_hadith_id_key" ON "favorites"("user_id", "hadith_id");

-- CreateIndex
CREATE INDEX "search_history_timestamp_idx" ON "search_history"("timestamp");

-- CreateIndex
CREATE INDEX "search_history_user_id_idx" ON "search_history"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "telegram_users_telegram_id_key" ON "telegram_users"("telegram_id");

-- CreateIndex
CREATE INDEX "telegram_users_is_subscribed_idx" ON "telegram_users"("is_subscribed");

-- CreateIndex
CREATE INDEX "telegram_users_language_code_idx" ON "telegram_users"("language_code");

-- CreateIndex
CREATE INDEX "telegram_users_telegram_id_idx" ON "telegram_users"("telegram_id");

-- AddForeignKey
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "telegram_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "search_history" ADD CONSTRAINT "search_history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "telegram_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
