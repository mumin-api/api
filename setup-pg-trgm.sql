-- Migration: Add pg_trgm extension for fuzzy text search
-- Run this manually: psql -d your_database -f setup-pg-trgm.sql

-- CreateExtension (idempotent)
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

-- Verify indexes were created
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE indexname = 'hadiths_arabic_text_trgm_idx'
  ) THEN
    RAISE EXCEPTION 'Failed to create hadiths_arabic_text_trgm_idx';
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE indexname = 'translations_text_trgm_idx'
  ) THEN
    RAISE EXCEPTION 'Failed to create translations_text_trgm_idx';
  END IF;
  
  RAISE NOTICE 'pg_trgm extension and indexes created successfully!';
END $$;
