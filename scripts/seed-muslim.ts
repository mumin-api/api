
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as readline from 'readline';
import * as path from 'path';

const prisma = new PrismaClient();

const BATCH_SIZE = 50;
const DATA_DIR = path.join(__dirname, '../data/muslim');

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const FILE_PATHS = {
    arabic: path.join(DATA_DIR, 'ara-muslim1.txt'),
    english: path.join(DATA_DIR, 'eng-muslim.txt'),
    russian: path.join(DATA_DIR, 'ru-muslim.txt'),
    urdu: path.join(DATA_DIR, 'urd-muslim.txt'),
};

async function validateFilesExist() {
    for (const [key, filePath] of Object.entries(FILE_PATHS)) {
        if (!fs.existsSync(filePath)) {
            throw new Error(`Missing file: ${key} -> ${filePath}`);
        }
        const stats = fs.statSync(filePath);
        console.log(`Verified ${key}: ${filePath} (${stats.size} bytes)`);
    }
}

async function parseFile(filePath: string): Promise<Map<number, string>> {
    const fileStream = fs.createReadStream(filePath);
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity,
    });

    const map = new Map<number, string>();
    let lineCount = 0;
    let skippedCount = 0;

    for await (const line of rl) {
        lineCount++;
        if (!line.trim()) continue;

        // Split by first pipe only
        const parts = line.split('|');
        if (parts.length < 2) {
            console.warn(`[WARN] Line ${lineCount} in ${path.basename(filePath)} is malformed (no pipe): "${line.substring(0, 50)}..."`);
            skippedCount++;
            continue;
        }

        const idStr = parts[0].trim();
        const text = parts.slice(1).join('|').trim(); // Join back in case text has pipes

        const id = parseInt(idStr, 10);
        if (isNaN(id)) {
            console.warn(`[WARN] Line ${lineCount} in ${path.basename(filePath)} has invalid ID: "${idStr}"`);
            skippedCount++;
            continue;
        }

        map.set(id, text);
    }

    console.log(`Parsed ${path.basename(filePath)}: ${map.size} entries (${skippedCount} skipped)`);
    return map;
}

function cleanText(text: string | undefined): string {
    if (!text) return '';

    let cleaned = text;

    // Remove [ID] prefix (e.g., "[123] Text")
    cleaned = cleaned.replace(/^\[\d+\]\s*/, '');

    // Remove leading/trailing pipes if any stray ones exist (though logic above handles split)
    // Actually, we usually just want to clean whitespace and maybe invisible chars

    // Normalize whitespace: replace sequences of whitespace with single space
    cleaned = cleaned.replace(/\s+/g, ' ').trim();

    return cleaned;
}

function chunk<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
        chunks.push(array.slice(i, i + size));
    }
    return chunks;
}

async function main() {
    const start = Date.now();
    console.log('Starting Sahih Muslim seeding...');

    try {
        // 1. Validate files
        await validateFilesExist();

        // 2. Ensure Collection exists
        const collectionSlug = 'sahih-muslim';
        let collection = await prisma.collection.findUnique({
            where: { slug: collectionSlug },
        });

        if (!collection) {
            console.log(`Creating collection: ${collectionSlug}`);
            collection = await prisma.collection.create({
                data: {
                    nameEnglish: 'Sahih Muslim',
                    nameArabic: 'صحيح مسلم',
                    slug: collectionSlug,
                    description: 'Sahih Muslim is one of the Kutub al-Sittah (six major hadith collections) of Sunni Islam.',
                },
            });
        } else {
            console.log(`Found collection: ${collection.nameEnglish} (ID: ${collection.id})`);
        }

        // 3. Parse files
        console.log('Parsing files...');
        const arabicMap = await parseFile(FILE_PATHS.arabic);
        const englishMap = await parseFile(FILE_PATHS.english);
        const russianMap = await parseFile(FILE_PATHS.russian);
        const urduMap = await parseFile(FILE_PATHS.urdu);

        // 4. Prepare payloads
        console.log('Preparing data...');
        const payloads: any[] = [];
        let skippedMissingArabic = 0;

        // Use Arabic keys as master list
        // Note: We iterate sorted keys for consistent ordering
        const sortedIds = Array.from(arabicMap.keys()).sort((a, b) => a - b);

        for (const id of sortedIds) {
            const rawArabic = arabicMap.get(id);
            const arabicText = cleanText(rawArabic);

            if (!arabicText) {
                console.warn(`[WARN] ID ${id} has empty Arabic text after cleaning. Skipping.`);
                continue;
            }

            const translations = [];

            // English
            if (englishMap.has(id)) {
                const text = cleanText(englishMap.get(id));
                if (text) {
                    translations.push({
                        languageCode: 'en',
                        text: text,
                    });
                }
            }

            // Russian
            if (russianMap.has(id)) {
                const text = cleanText(russianMap.get(id));
                if (text) {
                    translations.push({
                        languageCode: 'ru',
                        text: text,
                    });
                }
            }

            // Urdu
            if (urduMap.has(id)) {
                const text = cleanText(urduMap.get(id));
                if (text) {
                    translations.push({
                        languageCode: 'ur',
                        text: text,
                    });
                }
            }

            payloads.push({
                collectionId: collection.id,
                bookNumber: 1, // Treating as one standardized book for now
                hadithNumber: id,
                arabicText: arabicText,
                translations: translations,
            });
        }

        // Check for skipped Translations (IDs in Translation maps but not Arabic)
        const allTranslationIds = new Set([
            ...englishMap.keys(),
            ...russianMap.keys(),
            ...urduMap.keys()
        ]);

        let skippedOrphans = 0;
        for (const id of allTranslationIds) {
            if (!arabicMap.has(id)) {
                // Uncomment to debug specific skipped IDs
                // console.log(`[INFO] Skipping Translation-only ID: ${id}`);
                skippedOrphans++;
            }
        }

        console.log(`Ready to insert ${payloads.length} hadiths.`);
        console.log(`Skipped ${skippedOrphans} translation IDs that had no Arabic source.`);

        // 5. Batch Insert
        const batches = chunk(payloads, BATCH_SIZE);
        let processedCount = 0;

        for (const [index, batch] of batches.entries()) {
            await prisma.$transaction(async (tx) => {
                for (const item of batch) {
                    // Upsert Hadith
                    const hadith = await tx.hadith.upsert({
                        where: {
                            collection_bookNumber_hadithNumber: {
                                collection: collectionSlug,
                                bookNumber: item.bookNumber,
                                hadithNumber: item.hadithNumber
                            }
                        },
                        update: {
                            arabicText: item.arabicText
                        },
                        create: {
                            collection: collectionSlug,
                            collectionId: item.collectionId,
                            bookNumber: item.bookNumber,
                            hadithNumber: item.hadithNumber,
                            arabicText: item.arabicText,
                        }
                    });

                    // Handle Translations
                    // We typically delete existing translations for this hadith/lang and re-create, 
                    // or use upsert if composite unique constraint allows.
                    // Schema: @@unique([hadithId, languageCode]) in Translation model.

                    for (const trans of item.translations) {
                        await tx.translation.upsert({
                            where: {
                                hadithId_languageCode: {
                                    hadithId: hadith.id,
                                    languageCode: trans.languageCode
                                }
                            },
                            update: {
                                text: trans.text
                            },
                            create: {
                                hadithId: hadith.id,
                                languageCode: trans.languageCode,
                                text: trans.text
                            }
                        });
                    }
                }
            }, {
                maxWait: 20000,
                timeout: 100000
            });

            processedCount += batch.length;
            process.stdout.write(`\rProcessed ${processedCount}/${payloads.length} hadiths...`);

            // Add delay to let DB breathe
            await wait(200);
        }

        console.log('\nSeeding completed successfully!');

        // Update totalHadith count in Collection
        await prisma.collection.update({
            where: { id: collection.id },
            data: { totalHadith: payloads.length }
        });

        const duration = (Date.now() - start) / 1000;
        console.log(`Done in ${duration.toFixed(2)}s`);

    } catch (error) {
        console.error('\n[FATAL ERROR]', error);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

main();
