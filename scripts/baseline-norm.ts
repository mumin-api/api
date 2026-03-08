import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { AiService } from '../src/common/ai/ai.service';

async function check() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const ai = app.get(AiService);
  
  const text = "الحمد لله رب العالمين";
  console.log(`Generating test embedding for: "${text}"`);
  
  const vector = await ai.generateEmbedding(text);
  const norm = Math.sqrt(vector.reduce((sum, v) => sum + v*v, 0));
  
  console.log(`Baseline Gemini Norm: ${norm.toFixed(4)}`);
  console.log(`Vector Dimension: ${vector.length}`);
  
  await app.close();
}

check();
