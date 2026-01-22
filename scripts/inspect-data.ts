
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const userCount = await prisma.user.count();
    const keyCount = await prisma.apiKey.count();
    const hadithCount = await prisma.hadith.count();
    console.log(`Users: ${userCount}, Keys: ${keyCount}, Hadiths: ${hadithCount}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
