DROP VIEW IF EXISTS "search_view";
CREATE VIEW "search_view" AS
SELECT 
  h.id,
  h.hadith_number,
  h.arabic_text,
  h.collection_id,
  h.created_at,
  c.name_english as collection_name,
  c.slug as collection_slug
FROM "hadiths" h
LEFT JOIN "collections" c ON h.collection_id = c.id;