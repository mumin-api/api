
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

// Configuration
const BUKHARI_COLLECTION = {
    slug: 'sahih-bukhari',
    nameEnglish: 'Sahih al-Bukhari',
    nameArabic: 'صحيح البخاري',
    description: 'The most authentic collection of Hadith, compiled by Imam Muhammad ibn Ismail al-Bukhari.',
};

// Paths to data files
const DATA_DIR = path.join(__dirname, '../data');
const FILES = {
    arabic: path.join(DATA_DIR, 'ara-bukhari.txt'),
    english: path.join(DATA_DIR, 'eng-bukhari.txt'),
    russian: path.join(DATA_DIR, 'rus-bukhari.txt'),
    urdu: path.join(DATA_DIR, 'urd-bukhari.txt'),
};

interface HadithEntry {
    id: number;
    text: string;
}

// Helper to parse file
function parseFile(filePath: string): Map<number, string> {
    if (!fs.existsSync(filePath)) {
        console.warn(`⚠️ Warning: File not found: ${filePath}`);
        return new Map();
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    const map = new Map<number, string>();

    for (const line of lines) {
        if (!line.trim()) continue;

        // Split by the first occurrence of " | "
        const parts = line.split(' | ');
        if (parts.length < 2) continue;

        const id = parseInt(parts[0].trim(), 10);
        const text = parts.slice(1).join(' | ').trim(); // Rejoin in case pipe is in text

        if (!isNaN(id) && text) {
            map.set(id, text);
        }
    }

    return map;
}

async function main() {
    console.log('🚀 Starting Bukhari Import Script...');

    // 1. Ensure Collection Exists
    console.log('📚 Verifying Collection...');
    const collection = await prisma.collection.upsert({
        where: { slug: BUKHARI_COLLECTION.slug },
        update: {},
        create: BUKHARI_COLLECTION,
    });
    console.log(`✅ Collection ready: ${collection.nameEnglish} (ID: ${collection.id})`);

    // 2. Parse Files
    console.log('📂 Parsing data files...');
    const arabicMap = parseFile(FILES.arabic);
    const englishMap = parseFile(FILES.english);
    const russianMap = parseFile(FILES.russian);
    const urduMap = parseFile(FILES.urdu);

    console.log(`   - Arabic Lines: ${arabicMap.size}`);
    console.log(`   - English Lines: ${englishMap.size}`);
    console.log(`   - Russian Lines: ${russianMap.size}`);
    console.log(`   - Urdu Lines: ${urduMap.size}`);

    if (arabicMap.size === 0) {
        console.error('❌ Critical Error: No Arabic data found. Aborting.');
        return;
    }

    // 3. Import Data
    console.log('💾 Importing Hadiths to Database...');

    let processedCount = 0;
    const sortedIds = Array.from(arabicMap.keys()).sort((a, b) => a - b);

    for (const id of sortedIds) {
        const arabicText = arabicMap.get(id);
        if (!arabicText) continue;

        const hadithNumber = id;
        const bookNumber = 1; // Defaulting to 1 as per flat file structure

        // Create/Update Hadith
        const hadith = await prisma.hadith.upsert({
            where: {
                collection_bookNumber_hadithNumber: {
                    collection: BUKHARI_COLLECTION.slug,
                    bookNumber: bookNumber,
                    hadithNumber: hadithNumber,
                },
            },
            update: {
                arabicText: arabicText,
            },
            create: {
                collection: BUKHARI_COLLECTION.slug,
                collectionId: collection.id,
                bookNumber: bookNumber,
                hadithNumber: hadithNumber,
                arabicText: arabicText,
                metadata: { source: 'flat_file_import' },
            },
        });

        // Handle Translations
        const translations = [
            { lang: 'en', map: englishMap },
            { lang: 'ru', map: russianMap },
            { lang: 'ur', map: urduMap },
        ];

        for (const { lang, map } of translations) {
            const translationText = map.get(id);
            if (translationText) {
                await prisma.translation.upsert({
                    where: {
                        hadithId_languageCode: {
                            hadithId: hadith.id,
                            languageCode: lang,
                        },
                    },
                    update: {
                        text: translationText,
                    },
                    create: {
                        hadithId: hadith.id,
                        languageCode: lang,
                        text: translationText,
                    },
                });
            }
        }

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
