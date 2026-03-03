import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const provider = process.argv[2];

  if (!provider || !['openai', 'gemini', 'anthropic'].includes(provider)) {
    console.log('Usage: npx ts-node scripts/set-ai-provider.ts <provider>');
    console.log('Available providers: openai, gemini, anthropic');
    process.exit(1);
  }

  try {
    const setting = await prisma.systemSetting.upsert({
      where: { key: 'active_ai_provider' },
      update: { value: provider },
      create: { key: 'active_ai_provider', value: provider },
    });

    console.log(`✅ Success! Active AI provider set to: ${setting.value}`);
  } catch (error) {
    console.error('❌ Error setting provider:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
