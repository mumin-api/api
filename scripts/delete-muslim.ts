import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const collectionSlug = 'sahih-muslim';
    console.log(`🚀 Starting deletion process for collection: ${collectionSlug}`);

    try {
        // 1. Find the collection
        const collection = await prisma.collection.findUnique({
            where: { slug: collectionSlug },
            include: {
                _count: {
                    select: { hadiths: true }
                }
            }
        });

        if (!collection) {
            console.error(`❌ Collection '${collectionSlug}' not found!`);
            process.exit(1);
        }

        console.log(`📊 Found Collection: ${collection.nameEnglish}`);
        console.log(`   - ID: ${collection.id}`);
        console.log(`   - Metadata Count: ${collection.totalHadith}`);
        console.log(`   - Actual DB Count: ${collection._count.hadiths}`);

        if (collection._count.hadiths === 0) {
            console.log('⚠️  Collection is already empty. Exiting.');
            return;
        }

        console.log(`\n🗑️  Deleting ${collection._count.hadiths} hadiths (and their translations via cascade)...`);
        
        // 2. Delete all hadiths in this collection
        // info: The 'Translation' model has 'onDelete: Cascade' in the schema, 
        // so deleting Hadiths will automatically remove associated Translations.
        const deleteResult = await prisma.hadith.deleteMany({
            where: { collectionId: collection.id },
        });

        console.log(`✅ Successfully deleted ${deleteResult.count} hadith records.`);

        // 3. Reset the collection's totalHadith count
        const updatedCollection = await prisma.collection.update({
            where: { id: collection.id },
            data: { totalHadith: 0 },
        });

        console.log(`✅ Updated collection totalHadith count to ${updatedCollection.totalHadith}.`);
        console.log('\n🎉 Cleanup complete!');

    } catch (error) {
        console.error('\n❌ [FATAL ERROR]', error);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

main();
