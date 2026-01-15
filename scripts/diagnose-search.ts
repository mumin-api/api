
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
    log: ['query', 'info', 'warn', 'error'],
});

async function main() {
    console.log('🔍 Starting diagnostics...');

    try {
        await prisma.$connect();

        // 1. Check basic trigram function
        console.log('\n--- 1. Checking pg_trgm basic functions ---');
        const simResult: any[] = await prisma.$queryRawUnsafe(`SELECT similarity('пророк', 'рророк') as sim`);
        console.log(`Similarity ('пророк', 'рророк'): ${simResult[0].sim}`);

        // 2a. Check word_similarity
        console.log('\n--- 2a. Checking WORD similarity ---');
        await prisma.$transaction(async (tx) => {
            // Need to set word_similarity_threshold via SET command
            // Default is usually 0.6
            await tx.$executeRawUnsafe(`SET pg_trgm.word_similarity_threshold = 0.3;`);

            const longText = 'Это длинный текст в котором упоминается пророк и другие слова';
            const typoQuery = 'рророк';

            // Standard similarity (should be low)
            const stdSim: any[] = await tx.$queryRawUnsafe(`SELECT similarity('${typoQuery}', '${longText}') as sim`);
            console.log(`Standard Similarity (query vs whole text): ${stdSim[0].sim}`);

            // Word similarity (should be high)
            const wsSim: any[] = await tx.$queryRawUnsafe(`SELECT word_similarity('${typoQuery}', '${longText}') as sim`);
            console.log(`Word Similarity (query vs whole text): ${wsSim[0].sim}`);

            // Operator check
            const opCheck: any[] = await tx.$queryRawUnsafe(`SELECT '${typoQuery}' <% '${longText}' as matches`);
            console.log(`Operator <% check: ${opCheck[0].matches}`);
        });

        // 3. Find a real Russian translation
        console.log('\n--- 3. Finding a real Russian translation ---');
        const ruTranslation = await prisma.translation.findFirst({
            where: { languageCode: 'ru' },
            include: { hadith: true }
        });

        if (!ruTranslation) {
            console.error('❌ No Russian translations found in DB! This is the root cause.');
            return;
        }

        console.log(`Found Translation ID: ${ruTranslation.id}`);
        console.log(`Text preview: ${ruTranslation.text.substring(0, 50)}...`);

        // 4. Test search query logic manually for this specific text
        const words = ruTranslation.text.split(' ');
        const targetWord = words.find(w => w.length > 5);

        if (!targetWord) {
            console.log('Text too short for typo test.');
            return;
        }

        // Clean punctuation
        const cleanTarget = targetWord.replace(/[.,;!?()]/g, '');
        // Make typo
        const typoWord = 'X' + cleanTarget.substring(1);

        console.log(`\n--- 4. Testing typo search: "${typoWord}" (Original: "${cleanTarget}") ---`);

        await prisma.$transaction(async (tx) => {
            const threshold = 0.3;
            // Set BOTH thresholds just in case
            await tx.$executeRawUnsafe(`SELECT set_limit(${threshold});`);
            await tx.$executeRawUnsafe(`SET pg_trgm.word_similarity_threshold = ${threshold};`);

            const standardSim: any[] = await tx.$queryRawUnsafe(`SELECT similarity('${typoWord}', '${ruTranslation.text}') as sim`);
            console.log(`Standard Similarity (whole text): ${standardSim[0].sim}`);

            const wordSim: any[] = await tx.$queryRawUnsafe(`SELECT word_similarity('${typoWord}', '${ruTranslation.text}') as sim`);
            console.log(`Word Similarity (substring): ${wordSim[0].sim}`);

            const standardMatch: any[] = await tx.$queryRawUnsafe(`SELECT '${ruTranslation.text}' % '${typoWord}' as matches`);
            console.log(`Standard Match (%): ${standardMatch[0].matches}`);

            const wordMatch: any[] = await tx.$queryRawUnsafe(`SELECT '${typoWord}' <% '${ruTranslation.text}' as matches`);
            console.log(`Word Match (<%): ${wordMatch[0].matches}`);
        });
    } catch (e) {
        console.error('Diagnostics failed:', e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
