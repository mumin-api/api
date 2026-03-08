import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function check() {
  console.log('Analyzing ALL current embedding norms...');
  const records = await prisma.$queryRawUnsafe<any[]>(
    'SELECT id, embedding::text as vector_text FROM hadiths WHERE embedding IS NOT NULL'
  );

  const stats = {
    total: records.length,
    min: 2,
    max: 0,
    sum: 0,
    buckets: {} as Record<string, number>
  };

  for (const r of records) {
    const vals = r.vector_text.replace('[', '').replace(']', '').split(',').map(Number);
    const norm = Math.sqrt(vals.reduce((s: number, v: number) => s + v * v, 0));
    
    stats.sum += norm;
    if (norm < stats.min) stats.min = norm;
    if (norm > stats.max) stats.max = norm;
    
    // Bucket by 0.1
    const bucket = (Math.floor(norm * 10) / 10).toFixed(1);
    stats.buckets[bucket] = (stats.buckets[bucket] || 0) + 1;
  }

  console.log(`Summary:`);
  console.log(`- Total Embeddings: ${stats.total}`);
  console.log(`- Min Norm: ${stats.min.toFixed(4)}`);
  console.log(`- Max Norm: ${stats.max.toFixed(4)}`);
  console.log(`- Avg Norm: ${(stats.sum / stats.total).toFixed(4)}`);
  console.log(`- Distribution:`, JSON.stringify(stats.buckets, null, 2));

  await prisma.$disconnect();
}

check();
