import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const counts = await prisma.hadith.groupBy({
    by: ['collection'],
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } }
  });

  console.log('\nРеальное количество хадисов в таблице hadith:\n');
  console.log('Кол-во\t\tCollection slug');
  console.log('------\t\t---------------');
  counts.forEach(r => {
    console.log(`${r._count.id}\t\t${r.collection}`);
  });
  const total = counts.reduce((s, r) => s + r._count.id, 0);
  console.log(`\nИтого: ${total} хадисов`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
