-- 0. Disable timeout for long operations
SET statement_timeout = 0;

-- 1. Enable Required Extensions
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS vector;

-- 1.1 Add Normalized Column if not exists
ALTER TABLE hadiths ADD COLUMN IF NOT EXISTS normalized_arabic TEXT;

-- 2. Create HNSW index for Semantic Search
-- Optimized for 768 dimensions (Gemini/OpenAI)
CREATE INDEX IF NOT EXISTS hadith_embedding_hnsw 
ON hadiths 
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- 3. Create Arabic Normalization Function
-- Removes diacritics, tatweel, and normalizes alef/teh/yaa
CREATE OR REPLACE FUNCTION normalize_arabic(text TEXT) 
RETURNS TEXT AS $$
BEGIN
    IF text IS NULL THEN RETURN NULL; END IF;
    RETURN regexp_replace(
        regexp_replace(
            regexp_replace(
                regexp_replace(
                    regexp_replace(
                        text,
                        '[\u064B-\u065F\u0670\u0640]', '', 'g' -- Diacritics & Tatweel
                    ),
                    '[أإآ]', 'ا', 'g' -- Alef
                ),
                'ة', 'ه', 'g' -- Teh Marbuta
            ),
            'ى', 'ي', 'g' -- Yaa (Alif Maqsura)
        ),
        '\s+', ' ', 'g' -- Whitespace
    );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 4. Create Trigger for Auto-Normalization
CREATE OR REPLACE FUNCTION hadith_normalize_trigger_fn()
RETURNS trigger AS $$
BEGIN
  IF NEW.arabic_text IS NOT NULL THEN
    NEW.normalized_arabic := normalize_arabic(NEW.arabic_text);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_hadith_normalize ON hadiths;
CREATE TRIGGER trg_hadith_normalize
BEFORE INSERT OR UPDATE ON hadiths
FOR EACH ROW
EXECUTE FUNCTION hadith_normalize_trigger_fn();

-- 5. Create Trigram Index for Fast Text Search
-- This allows ILIKE '%query%' to be lightning fast
CREATE INDEX IF NOT EXISTS hadiths_normalized_trgm_idx 
ON hadiths 
USING gin (normalized_arabic gin_trgm_ops);

-- 6. Initial Data Population (for existing rows)
UPDATE hadiths SET normalized_arabic = normalize_arabic(arabic_text) 
WHERE normalized_arabic IS NULL AND arabic_text IS NOT NULL;
