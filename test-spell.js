
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function testSpell() {
  const tests = [
    { query: 'рророк', lang: 'ru' },
    { query: 'рамадн', lang: 'ru' },
    { query: 'rramadan', lang: 'en' }
  ];
  
  for (const test of tests) {
    const { query, lang } = test;
    const escapedQuery = query.replace(/'/g, "''");
    
    console.log(`--- Testing query: "${query}" (lang: ${lang}) ---`);
    
    try {
      // Mimic the logic in HadithsService.spellSuggest
      const results = await prisma.$queryRawUnsafe(`
        SELECT word, word_similarity('${escapedQuery}', word) as sim
        FROM (
            SELECT DISTINCT unnest(regexp_split_to_array(lower(text), '[^\\wа-яёea-z\\u0600-\\u06FF]+')) as word
            FROM translations
            WHERE language_code = '${lang}'
              AND word_similarity('${escapedQuery}', text) > 0.3
        ) words
        WHERE length(word) > 2
          AND word_similarity('${escapedQuery}', word) > 0.4
        ORDER BY sim DESC
        LIMIT 3
      `);
      console.log('Results:', JSON.stringify(results, null, 2));
    } catch (e) {
      console.error('Error:', e);
    }
  }
  
  await prisma.$disconnect();
}

testSpell();
