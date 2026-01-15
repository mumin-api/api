
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    try {
        await prisma.$connect();

        const query = 'проро';
        const language = 'ru';
        const threshold = 0.3;
        const limit = 20;
        const skip = 0;

        const escapedQuery = query.replace(/'/g, "''");
        const escapedLanguage = language.replace(/'/g, "''");

        console.log(`Running EXPLAIN ANALYZE for query: "${query}"`);

        await prisma.$transaction(async (tx) => {
            await tx.$executeRawUnsafe(`SET pg_trgm.word_similarity_threshold = ${threshold};`);

            // Note: I'm pasting the EXACT query from hadiths.service.ts
            const result: any[] = await tx.$queryRawUnsafe(`
                EXPLAIN ANALYZE
                WITH matching_ids AS (
                    -- IDs from Arabic text matches
                    SELECT h.id, word_similarity('${escapedQuery}', h.arabic_text) as score
                    FROM hadiths h
                    WHERE '${escapedQuery}' <% h.arabic_text
                    
                    UNION ALL
                    
                    -- IDs from translation matches  
                    SELECT h.id, word_similarity('${escapedQuery}', t.text) as score
                    FROM hadiths h
                    INNER JOIN translations t ON h.id = t.hadith_id
                    WHERE '${escapedQuery}' <% t.text
                        AND t.language_code = '${escapedLanguage}'
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
                    LEFT JOIN translations t ON h.id = t.hadith_id AND t.language_code = '${escapedLanguage}'
                )
                SELECT * FROM final_dataset
                ORDER BY relevance DESC
                LIMIT ${limit}
                OFFSET ${skip}
            `);

            console.log('\n--- Query Plan ---');
            result.forEach((row: any) => console.log(row['QUERY PLAN']));
        });

    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
