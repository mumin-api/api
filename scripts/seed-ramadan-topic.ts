import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌙 Seeding Ramadan Topic...');

  // 1. Create Topic
  const topic = await prisma.topic.upsert({
    where: { slug: 'ramadan' },
    update: {},
    create: {
      slug: 'ramadan',
      nameEnglish: 'Ramadan',
      nameArabic: 'رمضان',
      description: 'Hadiths related to the holy month of Ramadan, fasting, Tarawih prayers, and I\'tikaf.',
    },
  });

  console.log(`✅ Topic created: ${topic.nameEnglish}`);

  // 2. Find Bukhari Hadiths in Range 1899-2046
  // Note: These are hadithNumber in our flat Bukhari import
  const hadiths = await prisma.hadith.findMany({
    where: {
      collection: 'sahih-bukhari',
      hadithNumber: {
        gte: 1899,
        lte: 2046,
      },
    },
    select: { id: true },
  });

  console.log(`🔍 Found ${hadiths.length} hadiths for Ramadan topic.`);

  // 3. Link Topic to Hadiths
  let linkedCount = 0;
  for (const h of hadiths) {
    await prisma.hadithTopic.upsert({
      where: {
        hadithId_topicId: {
          hadithId: h.id,
          topicId: topic.id,
        },
      },
      update: {},
      create: {
        hadithId: h.id,
        topicId: topic.id,
      },
    });
    linkedCount++;
  }

  console.log(`✅ Linked ${linkedCount} hadiths to Ramadan topic.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
