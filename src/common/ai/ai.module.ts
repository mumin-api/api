import { Module, Global } from '@nestjs/common';
import { AiService } from './ai.service';
import { OpenAiProvider } from './providers/openai.provider';
import { GeminiProvider } from './providers/gemini.provider';
import { AnthropicProvider } from './providers/anthropic.provider';
import { PrismaModule } from '../../prisma/prisma.module';

import { VectorService } from './vector.service';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [
    AiService,
    VectorService,
    OpenAiProvider,
    GeminiProvider,
    AnthropicProvider,
  ],
  exports: [AiService, VectorService],
})
export class AiModule {}
