import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const SLUG_MAPPING: Record<string, string> = {
  'sahih-bukhari': 'bukhari',
  'sahih-muslim': 'muslim',
  'jami-at-tirmidhi': 'tirmidhi',
  'sunan-abu-dawud': 'abudawud',
  'sunan-ibn-majah': 'ibnmajah',
  'sunan-an-nasai': 'nasai',
  'riyad-as-saliheen': 'riyadh',
  'saliheen': 'riyadh',
  'abu-dawud': 'abudawud',
  'abi-dawud': 'abudawud',
  'an-nasai': 'nasai',
  'ibn-majah': 'ibnmajah',
};

async function migrate() {
  console.log('🚀 Starting slug migration...');

  for (const [oldSlug, newSlug] of Object.entries(SLUG_MAPPING)) {
    // 1. Check if old collection exists
    const collection = await prisma.collection.findUnique({
      where: { slug: oldSlug },
    });

    if (!collection) {
      console.log(`ℹ️ Old slug "${oldSlug}" not found in database. Skipping.`);
      continue;
    }

    // 2. Check if new slug already exists (e.g. from a partial seed)
    const existingNew = await prisma.collection.findUnique({
      where: { slug: newSlug },
    });

    if (existingNew) {
      console.log(`⚠️ New slug "${newSlug}" already exists (ID: ${existingNew.id}). Merging data...`);
      
      // Update all hadiths and translations to the new collection ID and name
      await prisma.hadith.updateMany({
        where: { collectionId: collection.id },
        data: { 
          collection: newSlug,
          collectionId: existingNew.id 
        },
      });

      // Delete the old collection
      await prisma.collection.delete({
        where: { id: collection.id },
      });
      
      console.log(`✅ Merged "${oldSlug}" into "${newSlug}".`);
    } else {
      console.log(`🔄 Updating "${oldSlug}" to "${newSlug}"...`);

      // Update collection slug
      await prisma.collection.update({
        where: { id: collection.id },
        data: { slug: newSlug },
      });

      // Update redundant collection string in hadiths
      await prisma.hadith.updateMany({
        where: { collectionId: collection.id },
        data: { collection: newSlug },
      });

      console.log(`✅ Updated "${oldSlug}" to "${newSlug}".`);
    }
  }

  console.log('\n🎉 Slug migration finished successfully!');
}

migrate()
  .catch((e) => {
    console.error('❌ Migration failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
