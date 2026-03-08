import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { AiService } from '../src/common/ai/ai.service';
import { OpenAiProvider } from '../src/common/ai/providers/openai.provider';

async function check() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const openai = app.get(OpenAiProvider);
  
  const text = "الحمد لله رب العالمين";
  console.log(`Generating test OpenAI embedding for: "${text}"`);
  
  const vector = await openai.generateEmbedding(text);
  const fullNorm = Math.sqrt(vector.reduce((sum, v) => sum + v*v, 0));
  
  const truncated = vector.slice(0, 768);
  const truncatedNorm = Math.sqrt(truncated.reduce((sum, v) => sum + v*v, 0));
  
  console.log(`Full OpenAI Norm (1536): ${fullNorm.toFixed(4)}`);
  console.log(`Truncated OpenAI Norm (768): ${truncatedNorm.toFixed(4)}`);
  
  await app.close();
}

check();
