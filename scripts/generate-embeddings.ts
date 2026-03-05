import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { AiService } from '../src/common/ai/ai.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { Logger } from '@nestjs/common';

const logger = new Logger('GenerateEmbeddings');

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const aiService = app.get(AiService);
  const prisma = app.get(PrismaService);

  logger.log('Starting embedding generation process...');

  try {
    // 1. Enable pgvector if not already enabled
    await prisma.$executeRawUnsafe('CREATE EXTENSION IF NOT EXISTS vector;');
    logger.log('Ensured pgvector extension is enabled.');
  } catch (e: any) {
    logger.warn(`Could not ensure extension: ${e.message}. It might already be enabled or you need admin rights.`);
  }

  // 2. Fetch hadiths without embeddings
  // Note: Since 'embedding' is Unsupported, we check using raw SQL
  const hadithsToProcess = await prisma.$queryRawUnsafe<any[]>(
    'SELECT id, arabic_text FROM hadiths WHERE embedding IS NULL LIMIT 2000'
  );

  logger.log(`Found ${hadithsToProcess.length} hadiths to process.`);

  let successCount = 0;
  let failCount = 0;

  for (const hadith of hadithsToProcess) {
    try {
      // We process Arabic text primarily for embeddings as it's the most stable source
      const textToEmbed = hadith.arabic_text;
      
      const embedding = await aiService.generateEmbedding(textToEmbed);
      
      // Convert array to pgvector string format: [v1,v2,v3...]
      const vectorVal = `[${embedding.join(',')}]`;
      
      await prisma.$executeRawUnsafe(
        'UPDATE hadiths SET embedding = $1::vector WHERE id = $2',
        vectorVal,
        hadith.id
      );

      successCount++;
      if (successCount % 50 === 0) {
        logger.log(`Progress: ${successCount}/${hadithsToProcess.length} processed...`);
      }
      
      // Small delay to respect rate limits (Gemini Free has 1500 RPM, so 25 per second is fine)
      // For safety, let's do 100ms
      await new Promise(resolve => setTimeout(resolve, 100));

    } catch (error: any) {
      logger.error(`Failed to process hadith ${hadith.id}: ${error.message}`);
      failCount++;
    }
  }

  logger.log(`Done! Success: ${successCount}, Failed: ${failCount}`);
  await app.close();
}

bootstrap();
