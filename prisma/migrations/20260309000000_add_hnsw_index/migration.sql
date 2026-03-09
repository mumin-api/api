-- Создаём HNSW индекс для быстрого приближённого векторного поиска.
-- HNSW (Hierarchical Navigable Small World) обеспечивает ~10-50x ускорение
-- по сравнению с sequential scan при небольшой потере точности (~1-2%).
--
-- Параметры:
--   m = 16         — количество соединений на уровень (баланс скорость/качество)
--   ef_construction = 64 — точность построения индекса (выше = лучше качество, но медленнее)

CREATE INDEX IF NOT EXISTS hadiths_embedding_hnsw_idx
    ON hadiths
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

