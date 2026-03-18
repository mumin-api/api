import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Updating search_view...');
  try {
    await prisma.$executeRawUnsafe(`DROP VIEW IF EXISTS "search_view";`);
    await prisma.$executeRawUnsafe(`
      CREATE VIEW "search_view" AS
      SELECT 
        h.id,
        h.book_number,
        h.hadith_number,
        h.arabic_text,
        h.normalized_arabic,
        h.collection_id,
        h.created_at,
        c.name_english as collection_name,
        c.slug as collection_slug,
        t.text as translation_text,
        t.grade,
        t.language_code
      FROM "hadiths" h
      LEFT JOIN "collections" c ON h.collection_id = c.id
      LEFT JOIN "translations" t ON t.hadith_id = h.id;
    `);
    console.log('search_view updated successfully!');
  } catch (error) {
    console.error('Failed to update search_view:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
