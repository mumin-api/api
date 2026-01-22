
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

const BATCH_SIZE = 100;
const DATA_FILE = path.join(__dirname, '../data/muslim_full_final.json');

function extractBookNumber(bookName: string): number {
    const match = bookName.match(/^(\d+)\./);
    if (match) return parseInt(match[1]);
    return 1; // Default
}

function chunk<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
        chunks.push(array.slice(i, i + size));
    }
    return chunks;
}

interface MappedHadith {
    mukhtasarId: number;
    fuadBaqiId: number | null;
    fuadId: number | null;
    globalId: number | null;
    arabicText: string;
    russianText: string;
    bookName: string;
    chapterName: string;
    metadata: any;
}

async function main() {
    const start = Date.now();
    console.log('🚀 Starting Sahih Muslim seeding from mapped JSON...');

    try {
        if (!fs.existsSync(DATA_FILE)) {
            throw new Error(`Data file not found: ${DATA_FILE}`);
        }

        const rawData: MappedHadith[] = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
        console.log(`📊 Loaded ${rawData.length} mapped hadiths.`);

        // 1. Ensure Collection exists
        const collectionSlug = 'sahih-muslim';
        let collection = await prisma.collection.findUnique({
            where: { slug: collectionSlug },
        });

        if (!collection) {
            console.log(`🆕 Creating collection: ${collectionSlug}`);
            collection = await prisma.collection.create({
                data: {
                    nameEnglish: 'Sahih Muslim',
                    nameArabic: 'صحيح مسلم',
                    slug: collectionSlug,
                    description: 'Sahih Muslim is one of the Kutub al-Sittah (six major hadith collections) of Sunni Islam.',
                },
            });
        } else {
            console.log(`✅ Found collection: ${collection.nameEnglish} (ID: ${collection.id})`);
        }

        // 2. Batch Insert
        const batches = chunk(rawData, BATCH_SIZE);
        let processedCount = 0;

        for (const batch of batches) {
            await prisma.$transaction(async (tx) => {
                for (const item of batch) {
                    const bookNum = extractBookNumber(item.bookName || '1.Unknown');

                    // Use fuadBaqiId as the primary hadith number for the collection
                    const hadithNum = item.fuadBaqiId || item.mukhtasarId;

                    // Upsert Hadith
                    const hadith = await tx.hadith.upsert({
                        where: {
                            collection_bookNumber_hadithNumber: {
                                collection: collectionSlug,
                                bookNumber: bookNum,
                                hadithNumber: hadithNum
                            }
                        },
                        update: {
                            arabicText: item.arabicText || '',
                            metadata: {
                                ...(item.metadata || {}),
                                mukhtasarId: item.mukhtasarId,
                                globalId: item.globalId
                            }
                        },
                        create: {
                            collection: collectionSlug,
                            collectionId: collection!.id,
                            bookNumber: bookNum,
                            hadithNumber: hadithNum,
                            arabicText: item.arabicText || '',
                            metadata: {
                                mukhtasarId: item.mukhtasarId,
                                globalId: item.globalId,
                                bookTitle: item.bookName,
                                chapterTitle: item.chapterName
                            }
                        }
                    });

                    // Upsert Russian Translation
                    if (item.russianText) {
                        await tx.translation.upsert({
                            where: {
                                hadithId_languageCode: {
                                    hadithId: hadith.id,
                                    languageCode: 'ru'
                                }
                            },
                            update: {
                                text: item.russianText
                            },
                            create: {
                                hadithId: hadith.id,
                                languageCode: 'ru',
                                text: item.russianText
                            }
                        });
                    }
                }
            }, {
                timeout: 60000
            });

            processedCount += batch.length;
            process.stdout.write(`\r✅ Processed ${processedCount}/${rawData.length} hadiths...`);
        }

        console.log('\n\n🎉 Seeding completed successfully!');

        // Update totalHadith count in Collection
        const actualCount = await prisma.hadith.count({
            where: { collection: collectionSlug }
        });

        await prisma.collection.update({
            where: { id: collection.id },
            data: { totalHadith: actualCount }
        });

        const duration = (Date.now() - start) / 1000;
        console.log(`🏁 Done in ${duration.toFixed(2)}s`);

    } catch (error) {
        console.error('\n❌ [FATAL ERROR]', error);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

main();
