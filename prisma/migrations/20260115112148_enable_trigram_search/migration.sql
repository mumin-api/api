-- CreateExtension
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateIndex for Arabic text (idempotent)
CREATE INDEX IF NOT EXISTS hadiths_arabic_text_trgm_idx 
  ON hadiths USING GIN (arabic_text gin_trgm_ops);

-- CreateIndex for translations (idempotent)
CREATE INDEX IF NOT EXISTS translations_text_trgm_idx 
  ON translations USING GIN (text gin_trgm_ops);

-- Composite index for faster joins (idempotent)
CREATE INDEX IF NOT EXISTS translations_hadith_lang_idx 
  ON translations (hadith_id, language_code);