import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';
import * as path from 'path';

const prisma = new PrismaClient();

async function reseedMuslim() {
  console.log('🚀 Starting Muslim Re-seed Process...');

  // 1. Delete existing Muslim hadiths
  console.log('🗑️ Deleting existing Muslim hadiths from database...');
  const deleted = await prisma.hadith.deleteMany({
    where: { collection: 'muslim' }
  });
  console.log(`✅ Deleted ${deleted.count} hadiths.`);

  // 2. Run seed-xml.ts for Muslim.xml
  const xmlPath = path.join(__dirname, '../data/Muslim.xml');
  console.log(`🌱 Seeding from ${xmlPath}...`);
  
  try {
    // Run the seeder with the specific XML file
    execSync(`npx ts-node scripts/seed-xml.ts data/Muslim.xml`, { 
      stdio: 'inherit',
      cwd: path.join(__dirname, '..')
    });
    console.log('\n✅ Seeding command completed.');
  } catch (error) {
    console.error('❌ Seeding failed:', error);
  }

  // 3. Verify final count
  const count = await prisma.hadith.count({
    where: { collection: 'muslim' }
  });
  console.log(`\n📊 Final Muslim count in DB: ${count}`);
}

reseedMuslim()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
