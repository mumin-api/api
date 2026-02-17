import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const topic = 'ramadan';
  console.log(`🔍 Testing filter for topic: ${topic}`);

  const where: any = {
    topics: {
      some: {
        topic: {
          slug: topic,
        },
      },
    },
  };

  const [hadiths, total] = await Promise.all([
    prisma.hadith.findMany({
      where,
      take: 5,
      include: {
        translations: { where: { languageCode: 'ru' } },
      },
    }),
    prisma.hadith.count({ where }),
  ]);

  console.log(`✅ Found ${total} hadiths for topic "${topic}".`);
  console.log('Sample data:');
  hadiths.forEach(h => {
    console.log(`- [${h.hadithNumber}] ${h.translations[0]?.text.substring(0, 100)}...`);
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
