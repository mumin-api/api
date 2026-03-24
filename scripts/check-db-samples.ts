import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkDb() {
  console.log('--- Bukhari Sample ---');
  const bukhari = await prisma.hadith.findFirst({
    where: { collection: 'bukhari' }
  });
  console.log(JSON.stringify(bukhari, null, 2));

  console.log('\n--- Muslim Sample ---');
  const muslim = await prisma.hadith.findFirst({
    where: { collection: 'muslim' }
  });
  console.log(JSON.stringify(muslim, null, 2));

  const muslimCount = await prisma.hadith.count({
    where: { collection: 'muslim' }
  });
  console.log(`\nMuslim Total Count: ${muslimCount}`);
}

checkDb()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
