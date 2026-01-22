
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const user = await prisma.user.findUnique({
        where: { email: 'dev@mumin.ink' },
        include: { apiKeys: true }
    });

    console.log('--- Dev User State ---');
    console.log(`Email: ${user?.email}`);
    console.log(`Balance: ${user?.balance}`);
    console.log(`Keys: ${user?.apiKeys.map(k => k.keyPrefix).join(', ')}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
