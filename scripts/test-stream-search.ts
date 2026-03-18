import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Mocking some dependencies or just using the logic from streamSearch
async function testStreamSearch(query: string, language: string = 'en') {
    const trimmed = (query || '').trim();
    if (!trimmed) return;

    const normalizedQuery = trimmed; // Simplified for test
    const limit = 50;

    console.log(`--- Testing stream search for "${query}" (Lang: ${language}) ---`);

    const likeQuery = `%${normalizedQuery}%`;
    const likeStemmedQuery = `%${normalizedQuery}%`; // Simplified

    try {
        const resultsRaw: any[] = await prisma.$queryRawUnsafe(`
            WITH ranked_translations AS (
                SELECT *,
                    ROW_NUMBER() OVER(PARTITION BY id ORDER BY (language_code = '${language}') DESC, (language_code = 'en') DESC) as rank
                FROM search_view
                WHERE (hadith_number = ${parseInt(trimmed, 10) || -1} OR normalized_arabic ILIKE '${likeQuery}' OR normalized_arabic ILIKE '${likeStemmedQuery}' OR translation_text ILIKE '${likeQuery}')
            )
            SELECT * FROM ranked_translations WHERE rank = 1
            ORDER BY (hadith_number = ${parseInt(trimmed, 10) || -1}) DESC, book_number ASC, hadith_number ASC
            LIMIT ${limit}
        `);

        console.log(`Rows returned from SQL: ${resultsRaw.length}`);

        for (const row of resultsRaw) {
            const data = JSON.stringify({
                id: row.id,
                collection: row.collection_name,
                bookNumber: row.book_number,
                hadithNumber: row.hadith_number,
                arabicText: row.arabic_text,
                translation: { text: row.translation_text, grade: row.grade, languageCode: language },
            });
            console.log(`Yielding: ${data.substring(0, 100)}...`);
            
            // Check for potential issues in the object
            const hadith = JSON.parse(data);
            if (!hadith.id) console.error('MISSING ID!');
            if (!hadith.translation) console.error('MISSING TRANSLATION!');
        }

    } catch (error) {
        console.error('Stream search failed with error:', error);
    }
}

async function main() {
    await testStreamSearch('1725', 'en');
    await testStreamSearch('1725', 'ru');
    await prisma.$disconnect();
}

main();
