import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌙 Seeding Ramadan Event...');

  const ramadanEvent = await prisma.appEvent.upsert({
    where: { slug: 'ramadan' },
    update: {
        isActive: true,
        config: {
            theme: 'ramadan-gold',
            showBanner: true,
            showStars: true,
            immersive: true,
            greeting: 'Ramadan Mubarak! 🌙',
        }
    },
    create: {
      slug: 'ramadan',
      name: 'Ramadan 2024/2025',
      isActive: true,
      config: {
          theme: 'ramadan-gold',
          showBanner: true,
          showStars: true,
          immersive: true,
          greeting: 'Ramadan Mubarak! 🌙',
      },
    },
  });

  console.log(`✅ Event seeded and activated: ${ramadanEvent.name}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
