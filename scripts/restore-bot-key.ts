import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const botEmail = 'bot@mumin.ink';
  const botApiKey = 'sk_mumin_1234567890abcdef1234567890abcdef';
  
  const { createHash } = await import('crypto');
  const keyHash = createHash('sha256').update(botApiKey).digest('hex');
  const keyPrefix = botApiKey.substring(0, 15);

  console.log('--- RESTORE BOT KEY SCRIPT ---');
  
  // 1. Ensure User exists
  let user = await prisma.user.findUnique({
    where: { email: botEmail }
  });

  if (!user) {
    console.log(`Creating system user: ${botEmail}`);
    user = await prisma.user.create({
      data: {
        email: botEmail,
        password: 'SYSTEM_BOT_DO_NOT_LOGIN',
        firstName: 'System',
        lastName: 'Bot',
        emailVerified: true,
        balance: 1000000,
      }
    });
  } else {
    console.log(`System user already exists: ${botEmail}`);
  }

  // 2. Ensure API Key exists
  const existingKey = await prisma.apiKey.findFirst({
    where: { keyHash: keyHash }
  });

  if (!existingKey) {
    console.log(`Creating API key in DB for prefix ${keyPrefix}...`);
    await prisma.apiKey.create({
      data: {
        keyHash: keyHash,
        keyPrefix: keyPrefix,
        userId: user.id,
        userEmail: botEmail,
        termsAcceptedAt: new Date(),
        termsVersion: '1.0',
        privacyPolicyAcceptedAt: new Date(),
        privacyPolicyVersion: '1.0',
        ipAtRegistration: '127.0.0.1',
        isActive: true,
      }
    });
    console.log('✅ API key restored successfully!');
  } else {
    console.log('⚠️ API Key already exists in database.');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
