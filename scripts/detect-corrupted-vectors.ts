import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function check() {
  console.log('Calculating L2 Norms of embeddings...');
  // Fetch last 2000 records that have an embedding
  const results = await prisma.$queryRawUnsafe<any[]>(
    "SELECT id, embedding::text as vector_text FROM hadiths WHERE embedding IS NOT NULL ORDER BY id DESC LIMIT 2000"
  );
  
  const corrupted = [];
  const healthy = [];

  for (const r of results) {
    if (!r.vector_text) continue;
    
    const vals = r.vector_text.replace('[', '').replace(']', '').split(',').map(Number);
    const norm = Math.sqrt(vals.reduce((sum: number, v: number) => sum + v*v, 0));
    
    if (norm < 0.9) {
      corrupted.push({ id: r.id, norm });
    } else {
      healthy.push({ id: r.id, norm });
    }
  }

  console.log(`Summary of analyzed records (${results.length}):`);
  console.log(`- Potential Gemini (Norm >= 0.9): ${healthy.length}`);
  console.log(`- Potential OpenAI Truncated (Norm < 0.9): ${corrupted.length}`);
  
  if (corrupted.length > 0) {
    console.log('First 10 corrupted IDs:', corrupted.slice(0, 10).map(c => c.id).join(', '));
    console.log('Corrupted norms:', corrupted.slice(0, 5).map(c => c.norm.toFixed(4)).join(', '));
  }
  
  await prisma.$disconnect();
}

check();
