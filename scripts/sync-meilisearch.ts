import { PrismaClient } from '@prisma/client';
import { MeiliSearch } from 'meilisearch';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();
const meilisearch = new MeiliSearch({
    host: process.env.MEILISEARCH_HOST || 'http://localhost:7700',
    apiKey: process.env.MEILISEARCH_API_KEY || 'masterKey',
});

async function sync() {
    console.log('Starting Meilisearch sync...');
    
    const index = meilisearch.index('hadiths');

    // Get all hadiths with their translations and collection info
    const totalCount = await prisma.hadith.count();
    console.log(`Found ${totalCount} hadiths to index.`);

    const batchSize = 1000;
    for (let i = 0; i < totalCount; i += batchSize) {
        const hadiths = await prisma.hadith.findMany({
            skip: i,
            take: batchSize,
            include: {
                translations: true,
                collectionRef: true,
            },
        });

        const documents: any[] = [];
        for (const h of hadiths) {
            // Index each translation as a separate document
            for (const t of h.translations) {
                documents.push({
                    id: `${h.id}_${t.languageCode}`, // Unique ID for Meilisearch
                    hadithId: h.id,                  // Original hadith ID
                    collection: h.collectionRef?.slug || h.collection,
                    collectionName: h.collectionRef?.nameEnglish || h.collection,
                    bookNumber: h.bookNumber,
                    hadithNumber: h.hadithNumber,
                    arabicText: h.arabicText,
                    arabicNarrator: h.arabicNarrator,
                    text: t.text,
                    languageCode: t.languageCode,
                    grade: t.grade || 'unknown',
                    metadata: h.metadata,
                });
            }

            // Also index a document with just Arabic if no translations exist, 
            // or just to have a "base" document (optional, but good for Arabic-only search)
            if (h.translations.length === 0) {
                documents.push({
                    id: `${h.id}_ar`,
                    hadithId: h.id,
                    collection: h.collectionRef?.slug || h.collection,
                    collectionName: h.collectionRef?.nameEnglish || h.collection,
                    bookNumber: h.bookNumber,
                    hadithNumber: h.hadithNumber,
                    arabicText: h.arabicText,
                    arabicNarrator: h.arabicNarrator,
                    text: '',
                    languageCode: 'ar',
                    grade: 'unknown',
                    metadata: h.metadata,
                });
            }
        }

        if (documents.length > 0) {
            const task = await index.addDocuments(documents);
            console.log(`Sent batch ${i / batchSize + 1} (${documents.length} docs). Task UID: ${task.taskUid}`);
        }
    }

    console.log('Sync task submission complete.');
}

sync()
    .catch(err => {
        console.error('Sync failed:', err);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
