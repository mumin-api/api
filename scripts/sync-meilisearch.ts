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

        const documents = hadiths.map(h => ({
            id: h.id,
            // Removed non-existent slug field
            collection: h.collectionRef?.slug || h.collection,
            collectionName: h.collectionRef?.nameEnglish || h.collection,
            bookNumber: h.bookNumber,
            hadithNumber: h.hadithNumber,
            arabicText: h.arabicText,
            arabicNarrator: h.arabicNarrator,
            translations: h.translations.map(t => ({
                text: t.text,
                languageCode: t.languageCode,
                grade: t.grade,
            })),
            // Flat fields for easier filtering in Meilisearch
            grade: h.translations[0]?.grade || 'unknown',
            languageCode: h.translations[0]?.languageCode || 'en',
            text: h.translations[0]?.text || '',
            metadata: h.metadata,
        }));

        const task = await index.addDocuments(documents);
        console.log(`Sent batch ${i / batchSize + 1} (${documents.length} docs). Task UID: ${task.taskUid}`);
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
