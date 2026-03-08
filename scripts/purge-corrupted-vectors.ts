import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function cleanup() {
  console.log('Starting "Black Magic" cleanup of corrupted OpenAI vectors...');
  
  // Identifying IDs using L2 Norm < 0.9
  const records = await prisma.$queryRawUnsafe<any[]>(
    "SELECT id, embedding::text as vector_text FROM hadiths WHERE embedding IS NOT NULL"
  );
  
  const toReset = [];
  for (const r of records) {
    const vals = r.vector_text.replace('[', '').replace(']', '').split(',').map(Number);
    const norm = Math.sqrt(vals.reduce((sum: number, v: number) => sum + v*v, 0));
    
    if (norm < 0.9) {
      toReset.push(r.id);
    }
  }

  console.log(`Found ${toReset.length} corrupted records out of ${records.length} total embeddings.`);

  if (toReset.length > 0) {
    // Process in batches of 500 to avoid long-running transaction issues
    const BATCH_SIZE = 500;
    for (let i = 0; i < toReset.length; i += BATCH_SIZE) {
      const batch = toReset.slice(i, i + BATCH_SIZE);
      await prisma.$executeRawUnsafe(
        `UPDATE hadiths SET embedding = NULL WHERE id IN (${batch.join(',')})`
      );
      console.log(`Reset batch ${i / BATCH_SIZE + 1} (${batch.length} records)...`);
    }
    console.log('✅ Cleanup complete!');
  } else {
    console.log('No corrupted vectors found.');
  }

  await prisma.$disconnect();
}

cleanup();
