import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { AiService } from '../src/common/ai/ai.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { Logger } from '@nestjs/common';
import * as cliProgress from 'cli-progress';

const logger = new Logger('GenerateEmbeddings');

// Force production mode to silence Prisma query logs
process.env.NODE_ENV = 'production';

async function bootstrap() {
  // Use minimal logging for NestJS initialization to keep the terminal clean
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error'],
  });
  const aiService = app.get(AiService);
  const prisma = app.get(PrismaService);

  console.log('\n🚀 Starting embedding generation process...');

  try {
    // 1. Enable pgvector if not already enabled
    await prisma.$executeRawUnsafe('CREATE EXTENSION IF NOT EXISTS vector;');
    console.log('✅ Ensured pgvector extension is enabled.');
  } catch (e: any) {
    console.warn(`⚠️ Could not ensure extension: ${e.message}.`);
  }

  // 2. Fetch hadiths without embeddings and with actual text
  // Note: Since 'embedding' is Unsupported, we check using raw SQL
  const hadithsToProcess = await prisma.$queryRawUnsafe<any[]>(
    'SELECT id, arabic_text FROM hadiths WHERE embedding IS NULL AND length(trim(arabic_text)) > 0 LIMIT 13000'
  );

  const total = hadithsToProcess.length;
  logger.log(`Found ${total} hadiths to process.`);

  const progressBar = new cliProgress.SingleBar({
    format: 'Progress | {bar} | {percentage}% | {value}/{total} Hadiths | ETA: {eta}s | OK: {success} | ERR: {failed} | Status: {status}',
    barCompleteChar: '\u2588',
    barIncompleteChar: '\u2591',
    hideCursor: true
  }, cliProgress.Presets.shades_classic);

  progressBar.start(total, 0, {
    success: 0,
    failed: 0,
    status: 'Initializing...'
  });

  let successCount = 0;
  let failCount = 0;

  // Configuration for parallel processing
  const CONCURRENCY = 10; // Process 10 hadiths at a time to stay within rate limits (target ~90 RPM)
  
  for (let i = 0; i < total; i += CONCURRENCY) {
    const chunk = hadithsToProcess.slice(i, i + CONCURRENCY);
    
    progressBar.update(successCount + failCount, { status: 'Processing...' });

    await Promise.all(chunk.map(async (hadith) => {
      try {
        const textToEmbed = hadith.arabic_text;
        const embedding = await aiService.generateEmbedding(textToEmbed);
        const vectorVal = `[${embedding.join(',')}]`;
        
        await prisma.$executeRawUnsafe(
          'UPDATE hadiths SET embedding = $1::vector WHERE id = $2',
          vectorVal,
          hadith.id
        );

        successCount++;
      } catch (error: any) {
        failCount++;
        
        // If we hit a total rate limit (all keys exhausted), update status
        if (error.message.includes('429') || error.message.includes('quota')) {
          progressBar.update(successCount + failCount, { 
            status: '⚠ QUOTA EXHAUSTED (ALL KEYS). WAITING 5S...' 
          });
          await new Promise(resolve => setTimeout(resolve, 5000));
        } else {
          progressBar.update(successCount + failCount, { 
            status: `✖ Error on ${hadith.id}` 
          });
        }
      } finally {
        progressBar.update(successCount + failCount, {
          success: successCount,
          failed: failCount
        });
      }
    }));

    // Small delay between chunks to avoid overwhelming the API
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  progressBar.update(total, { status: 'COMPLETE!' });
  progressBar.stop();
  logger.log(`Done! Success: ${successCount}, Failed: ${failCount}`);
  await app.close();
}

bootstrap();
