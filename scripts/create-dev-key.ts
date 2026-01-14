import { PrismaClient } from '@prisma/client';
import { createHash } from 'crypto';

const prisma = new PrismaClient();

async function createDevKey() {
    const apiKey = 'sk_mumin_dev_master_key_1234567890abcdef'; // 41 chars exactly
    const keyHash = createHash('sha256').update(apiKey).digest('hex');

    const key = await prisma.apiKey.upsert({
        where: { keyHash },
        update: {
            isActive: true,
            balance: 1000000,
        },
        create: {
            keyHash,
            keyPrefix: 'sk_mumin_dev',
            userEmail: 'dev@mumin.ink',
            maxDailyRequests: 10000,
            balance: 1000000,
            isActive: true,
            totalDataTransferred: BigInt(0),
        },
    } as any);

    console.log('✅ Development API Key created/updated:');
    console.log(`🔑 Key: ${apiKey}`);
    console.log('📝 Add this to your reader/.env.local:');
    console.log(`NEXT_PUBLIC_API_KEY=${apiKey}`);
}

createDevKey()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
