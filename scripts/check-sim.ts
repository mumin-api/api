
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    await prisma.$connect();

    const pairs = [
        ['проро', 'пророк'], // Prefix
        ['рророк', 'пророк'], // Typos (1 char)
        ['мухамад', 'Мухаммад'], // Typos (2 chars/case)
        ['вера', 'вера'], // Exact
        ['вера', 'неверие'], // Antonym/Different
        ['аллах', 'Аллах'], // Case
    ];

    try {
        console.log('Validating word_similarity scores to tune thresholds:');
        console.log('Query\t\tTarget\t\tScore');
        console.log('----------------------------------------');

        for (const [q, t] of pairs) {
            // We check word_similarity of query inside a sentence containing target
            const sentence = `Это длинный текст в котором есть слово ${t} и другие слова`;
            const res: any[] = await prisma.$queryRawUnsafe(`SELECT word_similarity('${q}', '${sentence}') as score`);
            console.log(`${q}\t\t${t}\t\t${res[0].score}`);
        }

    } finally {
        await prisma.$disconnect();
    }
}

main();
