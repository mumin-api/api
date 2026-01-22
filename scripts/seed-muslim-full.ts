
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

const MUSLIM_COLLECTION = {
    slug: 'sahih-muslim',
    nameEnglish: 'Sahih Muslim',
    nameArabic: 'صحيح مسلم',
    description: 'The second most authentic collection of Hadith, compiled by Imam Muslim ibn al-Hajjaj.',
};

const DATA_FILE = path.join(__dirname, '../data/muslim_full_final.json');

async function main() {
    console.log('🚀 Starting Sahih Muslim Full Import (Mukhtasar Al-Munziri) Script...');

    if (!fs.existsSync(DATA_FILE)) {
        console.error(`❌ Error: Data file not found at ${DATA_FILE}`);
        return;
    }

    // 1. Ensure Collection Exists
    console.log('📚 Verifying Collection...');
    const collection = await prisma.collection.upsert({
        where: { slug: MUSLIM_COLLECTION.slug },
        update: {},
        create: MUSLIM_COLLECTION,
    });
    console.log(`✅ Collection ready: ${collection.nameEnglish} (ID: ${collection.id})`);

    // 2. Load JSON
    console.log('📂 Loading JSON data...');
    const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
    console.log(`✅ Loaded ${data.length} hadith entries.`);

    // 3. Import Data
    console.log('💾 Importing Hadiths to Database...');

    let processedCount = 0;

    // Sort by Mukhtasar ID to ensure order
    data.sort((a: any, b: any) => a.mukhtasarId - b.mukhtasarId);

    for (const entry of data) {
        const { mukhtasarId, fuadBaqiId, arabicText, russianText, bookName, chapterName } = entry;

        // Note: Some might be missing Arabic if we didn't find a match, but we still seed them
        const hadithNumber = mukhtasarId;
        const bookNumber = 1; // Keeping it flat for now as Mukhtasar Al-Munziri is often treated as a single volume sequence

        // Create/Update Hadith
        const hadith = await prisma.hadith.upsert({
            where: {
                collection_bookNumber_hadithNumber: {
                    collection: MUSLIM_COLLECTION.slug,
                    bookNumber: bookNumber,
                    hadithNumber: hadithNumber,
                },
            },
            update: {
                arabicText: arabicText || '',
                metadata: {
                    fuadBaqiReference: fuadBaqiId,
                    originalBook: bookName,
                    originalChapter: chapterName,
                    source: 'mukhtasar_al_munziri_ru'
                },
            },
            create: {
                collection: MUSLIM_COLLECTION.slug,
                collectionId: collection.id,
                bookNumber: bookNumber,
                hadithNumber: hadithNumber,
                arabicText: arabicText || '',
                metadata: {
                    fuadBaqiReference: fuadBaqiId,
                    originalBook: bookName,
                    originalChapter: chapterName,
                    source: 'mukhtasar_al_munziri_ru'
                },
            },
        });

        // Handle Russian Translation
        await prisma.translation.upsert({
            where: {
                hadithId_languageCode: {
                    hadithId: hadith.id,
                    languageCode: 'ru',
                },
            },
            update: {
                text: russianText,
            },
            create: {
                hadithId: hadith.id,
                languageCode: 'ru',
                text: russianText,
            },
        });

        processedCount++;
        if (processedCount % 100 === 0) {
            process.stdout.write(`\r⏳ Processed ${processedCount} hadiths...`);
        }
    }

    // Update total count
    await prisma.collection.update({
        where: { id: collection.id },
        data: { totalHadith: processedCount },
    });

    console.log(`\n\n🎉 Import Complete!`);
    console.log(`✅ Total Processed: ${processedCount}`);

    await prisma.$disconnect();
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
