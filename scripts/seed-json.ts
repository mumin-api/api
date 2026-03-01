import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();
const DATA_DIR = path.join(__dirname, '../data');

const collectionsMeta: Record<string, { slug: string, nameEnglish: string, nameArabic?: string, description?: string }> = {
    'Jami-at-Tirmidhi.json': {
        slug: 'jami-at-tirmidhi',
        nameEnglish: 'Jami` at-Tirmidhi',
        description: 'A collection of hadith compiled by Imam Abu `Isa Muhammad at-Tirmidhi'
    },
    'Sahih-Muslim.json': {
        slug: 'sahih-muslim',
        nameEnglish: 'Sahih Muslim',
        nameArabic: 'صحيح مسلم',
        description: 'One of the Kutub al-Sittah (six major hadith collections), compiled by Imam Muslim'
    },
    'Sahih-al-Bukhari.json': {
        slug: 'sahih-bukhari',
        nameEnglish: 'Sahih al-Bukhari',
        nameArabic: 'صحيح البخاري',
        description: 'The most authentic collection of Hadith, compiled by Imam al-Bukhari'
    },
    'Sunan-Dawud.json': {
        slug: 'sunan-abu-dawud',
        nameEnglish: 'Sunan Abi Dawud',
        description: 'A collection of hadith compiled by Imam Abu Dawud'
    },
    'Sunan-Ibn-Majah.json': {
        slug: 'sunan-ibn-majah',
        nameEnglish: 'Sunan Ibn Majah',
        description: 'A collection of hadith compiled by Imam Ibn Majah'
    },
    'Sunan-an-Nasa.json': {
        slug: 'sunan-an-nasai',
        nameEnglish: 'Sunan an-Nasa\'i',
        description: 'A collection of hadith compiled by Imam an-Nasa\'i'
    }
};

function extractNumbers(hadith: any, fallbackIndex: number) {
    let bookNumber = hadith['Chapter_Number'] || 1;
    let hadithNumber = 0;

    // Try parsing In-book reference: "Book 1, Hadith 1"
    if (hadith['In-book reference']) {
        const bookMatch = /Book\s+(\d+)/i.exec(hadith['In-book reference']);
        if (bookMatch) bookNumber = parseInt(bookMatch[1], 10);
        
        const hadithMatch = /Hadith\s+(\d+)/i.exec(hadith['In-book reference']);
        if (hadithMatch) hadithNumber = parseInt(hadithMatch[1], 10);
    }

    // Fallback to Reference: "https://sunnah.com/tirmidhi:1"
    if (hadithNumber === 0 && hadith['Reference']) {
        const colonMatch = /:(\d+)/.exec(hadith['Reference']);
        if (colonMatch) {
            hadithNumber = parseInt(colonMatch[1], 10);
        } else {
            const slashMatch = /\/(\d+)$/.exec(hadith['Reference']);
            if (slashMatch) {
                hadithNumber = parseInt(slashMatch[1], 10);
            }
        }
    }

    if (hadithNumber === 0 || isNaN(hadithNumber)) {
        hadithNumber = fallbackIndex;
    }

    if (isNaN(bookNumber)) {
        bookNumber = 1;
    }

    return { bookNumber, hadithNumber };
}

async function processFile(filename: string) {
    const filePath = path.join(DATA_DIR, filename);
    if (!fs.existsSync(filePath)) {
        console.warn(`⚠️ Warning: JSON file not found: ${filePath}`);
        return;
    }

    const meta = collectionsMeta[filename];
    if (!meta) {
        console.warn(`⚠️ Warning: No metadata defined for ${filename}. Skipping.`);
        return;
    }

    console.log(`\n📚 Processing Collection: ${meta.nameEnglish} (${filename})`);

    // 1. Ensure Collection Exists
    const collection = await prisma.collection.upsert({
        where: { slug: meta.slug },
        update: {},
        create: meta,
    });
    console.log(`✅ Collection ready: ${collection.nameEnglish} (ID: ${collection.id})`);

    // 2. Parse File content
    console.log(`📂 Reading JSON data from ${filename}...`);
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const hadiths: any[] = JSON.parse(fileContent);
    console.log(`   - Found ${hadiths.length} hadith entries.`);

    // 3. Import Data
    console.log(`💾 Importing Hadiths to Database...`);
    let processedCount = 0;
    const seenIds = new Set<string>();

    for (let i = 0; i < hadiths.length; i++) {
        const raw = hadiths[i];
        
        // Sometimes the scraping has a lot of empty ones if failed, we skip empty arabic text
        if (!raw['Arabic_Text'] || raw['Arabic_Text'].trim() === '') {
            continue;
        }

        let { bookNumber, hadithNumber } = extractNumbers(raw, i + 1);

        // Deduplicate numbers
        while (seenIds.has(`${bookNumber}_${hadithNumber}`)) {
            hadithNumber++;
        }
        seenIds.add(`${bookNumber}_${hadithNumber}`);

        const metadata = {
            chapterArabic: raw['Chapter_Title_Arabic'] || null,
            chapterEnglish: raw['Chapter_Title_English'] || null,
            grade: raw['Grade'] || null,
            referenceUrl: raw['Reference'] || null,
            sourceBook: raw['Book'] || null
        };

        // Create/Update Hadith
        const hadith = await prisma.hadith.upsert({
            where: {
                collection_bookNumber_hadithNumber: {
                    collection: meta.slug,
                    bookNumber: bookNumber,
                    hadithNumber: hadithNumber,
                },
            },
            update: {
                arabicText: raw['Arabic_Text'],
                metadata: metadata,
            },
            create: {
                collection: meta.slug,
                collectionId: collection.id,
                bookNumber: bookNumber,
                hadithNumber: hadithNumber,
                arabicText: raw['Arabic_Text'],
                metadata: metadata,
            },
        });

        // Insert English Translation if exists
        if (raw['English_Text'] && raw['English_Text'].trim() !== '') {
            await prisma.translation.upsert({
                where: {
                    hadithId_languageCode: {
                        hadithId: hadith.id,
                        languageCode: 'en',
                    },
                },
                update: {
                    text: raw['English_Text'],
                    grade: raw['Grade'] || null,
                },
                create: {
                    hadithId: hadith.id,
                    languageCode: 'en',
                    text: raw['English_Text'],
                    grade: raw['Grade'] || null,
                },
            });
        }

        processedCount++;
        if (processedCount % 500 === 0) {
            process.stdout.write(`\r⏳ Processed ${processedCount}/${hadiths.length} ...`);
        }
    }

    // Update total count
    await prisma.collection.update({
        where: { id: collection.id },
        data: { totalHadith: processedCount },
    });

    console.log(`\n🎉 Completed ${meta.nameEnglish}! Processed: ${processedCount}`);
}

async function main() {
    console.log('🚀 Starting JSON Hadiths Import Script...');

    const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json'));
    console.log(`Found ${files.length} JSON files to process.`);

    for (const file of files) {
        await processFile(file);
    }

    console.log(`\n\n✅ All files processed successfully!`);
    await prisma.$disconnect();
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
