-- Enable pg_trgm extension if not exists
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Create GIN index for arabic_text in hadiths
CREATE INDEX IF NOT EXISTS "hadiths_arabic_text_trgm_idx" ON "hadiths" USING gin ("arabic_text" gin_trgm_ops);

-- Create GIN index for text in translations
CREATE INDEX IF NOT EXISTS "translations_text_trgm_idx" ON "translations" USING gin ("text" gin_trgm_ops);

-- Create GIN index for name_english in topics
CREATE INDEX IF NOT EXISTS "topics_name_english_trgm_idx" ON "topics" USING gin ("name_english" gin_trgm_ops);

-- Create GIN index for name_arabic in topics
CREATE INDEX IF NOT EXISTS "topics_name_arabic_trgm_idx" ON "topics" USING gin ("name_arabic" gin_trgm_ops);
