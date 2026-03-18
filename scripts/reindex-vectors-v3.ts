import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { AiService } from '../src/common/ai/ai.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { REDIS_CLIENT } from '../src/common/redis/redis.module';
import { Pinecone } from '@pinecone-database/pinecone';
import * as cliProgress from 'cli-progress';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { createHash } from 'crypto';

dotenv.config({ path: path.join(__dirname, '../.env') });

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error'],
  });
  
  const aiService = app.get(AiService);
  const prisma = app.get(PrismaService);
  const redis = app.get(REDIS_CLIENT);
  
  const apiKey = process.env.PINECONE_API_KEY;
  const indexName = 'mumin-v3';
  const host = 'https://mumin-v3-gljivs4.svc.aped-4627-b74a.pinecone.io';

  const pc = new Pinecone({ apiKey: apiKey! });
  const index = pc.index(indexName, host);

  console.log(`\n🚀 Starting 3072-dim re-indexing to "${indexName}"...`);

  const hadiths = await prisma.hadith.findMany({
    select: { id: true, arabicText: true, collection: true, bookNumber: true, hadithNumber: true },
    where: { arabicText: { not: '' } }
  });

  const totalHadiths = hadiths.length;
  console.log(`Found ${totalHadiths} hadiths in total.`);

  console.log('🔍 Checking existing progress in cache...');
  const alreadyDone: any[] = [];
  const toProcess: any[] = [];

  for (let i = 0; i < totalHadiths; i += 1000) {
    const chunk = hadiths.slice(i, i + 1000);
    const keys = chunk.map(h => {
      const hash = createHash('sha256').update(h.arabicText.trim().toLowerCase()).digest('hex');
      return `embedding:v3:${hash}`;
    });

    const results = await redis.mget(...keys);
    chunk.forEach((h, index) => {
      if (results[index]) {
        alreadyDone.push(h);
      } else {
        toProcess.push(h);
      }
    });
  }

  const successCount = alreadyDone.length;
  const totalToProcess = toProcess.length;

  console.log(`✅ Progress: ${successCount} already in cache. ${totalToProcess} remaining.`);

  const progressBar = new cliProgress.SingleBar({
    format: 'Progress | {bar} | {percentage}% | {value}/{total} Hadiths | ETA: {eta}s | NEW: {success} | ERR: {failed} | Status: {status}',
    barCompleteChar: '\u2588',
    barIncompleteChar: '\u2591',
    hideCursor: true
  }, cliProgress.Presets.shades_classic);

  progressBar.start(totalHadiths, successCount, {
    success: 0,
    failed: 0,
    status: 'Resuming...'
  });

  let currentSuccess = 0;
  let failCount = 0;
  const CONCURRENCY = 10;
  
  for (let i = 0; i < totalToProcess; i += CONCURRENCY) {
    const chunk = toProcess.slice(i, i + CONCURRENCY);
    
    await Promise.all(chunk.map(async (hadith) => {
      try {
        const embedding = await aiService.generateEmbedding(hadith.arabicText);
        
        await index.upsert([{
          id: hadith.id.toString(),
          values: embedding,
          metadata: {
            collection: hadith.collection,
            bookNumber: hadith.bookNumber,
            hadithNumber: hadith.hadithNumber,
            updatedAt: new Date().toISOString()
          }
        }]);

        currentSuccess++;
      } catch (error: any) {
        failCount++;
        progressBar.update(successCount + currentSuccess + failCount, { status: `Error on ${hadith.id}: ${error.message.substring(0, 20)}` });
      } finally {
        progressBar.update(successCount + currentSuccess + failCount, {
          success: currentSuccess,
          failed: failCount
        });
      }
    }));

    await new Promise(resolve => setTimeout(resolve, 100));
  }

  progressBar.update(totalHadiths, { status: 'COMPLETE!' });
  progressBar.stop();
  console.log(`\nDone! Successfully indexed ${currentSuccess} new hadiths. Total v3 index: ${successCount + currentSuccess}`);
  
  await app.close();
}

bootstrap();
