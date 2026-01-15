
BEGIN;
SET pg_trgm.word_similarity_threshold = 0.3;
EXPLAIN ANALYZE
WITH matching_ids AS (
    SELECT h.id, word_similarity('проро', h.arabic_text) as score
    FROM hadiths h
    WHERE 'проро' <% h.arabic_text
    
    UNION ALL
    
    SELECT h.id, word_similarity('проро', t.text) as score
    FROM hadiths h
    INNER JOIN translations t ON h.id = t.hadith_id
    WHERE 'проро' <% t.text
        AND t.language_code = 'ru'
),
best_scores AS (
    SELECT id, MAX(score) as relevance
    FROM matching_ids
    GROUP BY id
),
final_dataset AS (
    SELECT 
        h.id,
        b.relevance,
        COUNT(*) OVER() as total_count
    FROM best_scores b
    INNER JOIN hadiths h ON b.id = h.id
)
SELECT * FROM final_dataset
ORDER BY relevance DESC
LIMIT 20;
ROLLBACK;
