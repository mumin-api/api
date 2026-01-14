
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const hadith = await prisma.hadith.findUnique({
        where: { id: 123 },
        include: {
            translations: true,
            collectionRef: true,
        },
    });

    console.log('--- DB Record ---');
    console.dir(hadith, { depth: null });

    console.log('\n--- Derived API Response (Simulation) ---');
    if (hadith) {
        console.log({
            id: hadith.id,
            collection: hadith.collectionRef?.nameEnglish || hadith.collection,
            arabicText: hadith.arabicText,
            translation: hadith.translations?.[0] || null,
        });
    }
}

main().finally(() => prisma.$disconnect());
