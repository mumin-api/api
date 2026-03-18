import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const language = 'ru';
  const query = 'пророк'; // Example common word in RU corpus
  const likeQuery = `%${query}%`;
  
  console.log(`Testing search for: "${query}" (lang: ${language})`);
  
  try {
    const results: any[] = await prisma.$queryRawUnsafe(`
      SELECT id, collection_name, book_number, hadith_number, arabic_text, translation_text, grade
      FROM search_view
      WHERE (normalized_arabic ILIKE '${likeQuery}' OR translation_text ILIKE '${likeQuery}')
      AND language_code = '${language}'
      LIMIT 5
    `);
    
    console.log(`Found ${results.length} results.`);
    if (results.length > 0) {
      console.log('Sample result:', {
        id: results[0].id,
        collection: results[0].collection_name,
        translation: results[0].translation_text?.substring(0, 50) + '...'
      });
    } else {
        // Double check what IS in the view
        const sampleRows: any[] = await prisma.$queryRawUnsafe(`SELECT * FROM search_view LIMIT 1`);
        console.log('Sample row from view:', sampleRows[0]);
    }
  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
