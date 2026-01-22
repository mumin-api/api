import { PrismaClient } from '@prisma/client';
import { createHash } from 'crypto';

const prisma = new PrismaClient();

async function createDevKey() {
    const apiKey = 'sk_mumin_dev_master_key_1234567890abcderf'; // 41 chars exactly
    const keyHash = createHash('sha256').update(apiKey).digest('hex');

    const user = await prisma.user.findUnique({
        where: { email: 'dev@mumin.ink' }
    });
    if (!user) throw new Error('Dev user not found. Run seed script first.');

    // Delete existing dev keys for this user
    await prisma.apiKey.deleteMany({
        where: { userEmail: 'dev@mumin.ink' }
    });

    const key = await prisma.apiKey.create({
        data: {
            keyHash,
            keyPrefix: 'sk_mumin_dev',
            userId: user.id,
            userEmail: 'dev@mumin.ink',
            maxDailyRequests: 10000,
            isActive: true,
        },
    });

    console.log('✅ Development API Key created/updated:');
    console.log(`🔑 Key: ${apiKey}`);
    console.log('📝 Add this to your reader/.env.local:');
    console.log(`NEXT_PUBLIC_API_KEY=${apiKey}`);
}

createDevKey()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
