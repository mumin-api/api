-- DropIndex
DROP INDEX IF EXISTS "hadiths_arabic_text_trgm_idx";

-- DropIndex
DROP INDEX IF EXISTS "translations_hadith_lang_idx";

-- DropIndex
DROP INDEX IF EXISTS "translations_text_trgm_idx";

-- Enable pg_trgm for fuzzy search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- AlterTable

ALTER TABLE "request_logs" ALTER COLUMN "endpoint" SET DATA TYPE TEXT;
