import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function testNumericSearch(hadithNumber: number, query: string, language: string, collection?: string, grade?: string) {
    const limit = 20;
    const offset = 0;
    
    console.log(`--- Testing numeric search for "${query}" (Number: ${hadithNumber}, Lang: ${language}) ---`);
    
    try {
        const results: any[] = await prisma.$queryRawUnsafe(`
            WITH scored_results AS (
                SELECT id, 100 as score FROM hadiths WHERE hadith_number = ${hadithNumber} ${collection ? `AND (collection = '${collection}' OR collection_id IN (SELECT id FROM collections WHERE slug = '${collection}'))` : ''}
                UNION ALL
                SELECT id, 50 as score FROM hadiths WHERE CAST(hadith_number AS TEXT) LIKE '%${query}%' AND hadith_number != ${hadithNumber} ${collection ? `AND (collection = '${collection}' OR collection_id IN (SELECT id FROM collections WHERE slug = '${collection}'))` : ''}
                UNION ALL
                SELECT h.id, 30 as score FROM hadiths h LEFT JOIN translations t ON t.hadith_id = h.id AND t.language_code = '${language}'
                WHERE (h.normalized_arabic ILIKE '%${query}%' OR t.text ILIKE '%${query}%') AND h.hadith_number != ${hadithNumber} ${collection ? `AND (h.collection = '${collection}' OR h.collection_id IN (SELECT id FROM collections WHERE slug = '${collection}'))` : ''} ${grade ? `AND t.grade = '${grade}'` : ''}
            )
            SELECT * FROM (SELECT id, MAX(score) as max_score FROM scored_results GROUP BY id) s
            ORDER BY max_score DESC, id ASC LIMIT ${limit} OFFSET ${offset}
        `);
        
        console.log(`Results found: ${results.length}`);
        
        const totalRaw: any[] = await prisma.$queryRawUnsafe(`
            SELECT COUNT(DISTINCT id) as total FROM (
                SELECT id FROM hadiths WHERE hadith_number = ${hadithNumber} 
                UNION 
                SELECT id FROM hadiths WHERE CAST(hadith_number AS TEXT) LIKE '%${query}%' 
                UNION 
                SELECT h.id FROM hadiths h LEFT JOIN translations t ON t.hadith_id = h.id AND t.language_code = '${language}' 
                WHERE (h.normalized_arabic ILIKE '%${query}%' OR t.text ILIKE '%${query}%')
            ) s
        `);
        
        if (!totalRaw || totalRaw.length === 0) {
            console.log('totalRaw is empty!');
        } else {
            const total = Number(totalRaw[0].total);
            console.log(`Total count: ${total}`);
        }
        
        if (results.length > 0) {
            const ids = results.map(r => r.id);
            const hadiths = await prisma.hadith.findMany({
                where: { id: { in: ids } },
                include: { translations: { where: { languageCode: language } }, collectionRef: true }
            });
            console.log(`Sample hadith: ${hadiths[0]?.collection} ${hadiths[0]?.hadithNumber}`);
        }

    } catch (error) {
        console.error('Test failed with error:', error);
    }
}

async function main() {
    await testNumericSearch(1725, '1725', 'en');
    await testNumericSearch(1725, '1725', 'ru');
    await prisma.$disconnect();
}

main();
