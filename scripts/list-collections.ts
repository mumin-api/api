import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const collections = await prisma.collection.findMany({
    select: {
      nameEnglish: true,
      slug: true,
      id: true,
    }
  });

  console.log('--- COLLECTIONS ---');
  collections.forEach(c => {
    console.log(`${c.id}: ${c.nameEnglish} -> slug: ${c.slug}`);
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
