import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const count = await prisma.hadith.count();
  console.log(`Total hadiths: ${count}`);
  
  const sample = await prisma.hadith.findFirst();
  console.log('Sample hadith:', JSON.stringify(sample, null, 2));

  const distinctCollections = await prisma.hadith.findMany({
    select: { collection: true },
    distinct: ['collection'],
  });
  console.log('Distinct collections:', JSON.stringify(distinctCollections, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
