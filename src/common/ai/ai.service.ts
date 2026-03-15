import { Injectable, Logger, Inject, ServiceUnavailableException } from '@nestjs/common';
import { SystemConfigService } from './../../common/utils/system-config.service';
import { createHash } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { OpenAiProvider } from './providers/openai.provider';
import { GeminiProvider } from './providers/gemini.provider';
import { AnthropicProvider } from './providers/anthropic.provider';
import { AiProvider, ExplanationResult } from './interfaces/ai-provider.interface';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '@/common/redis/redis.module';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly providers: Map<string, AiProvider> = new Map();
  /** In-memory кэш имени активного вектор-провайдера, чтобы не лезть в БД каждый раз */
  private cachedVectorProvider: string | null = null;

  constructor(
    private prisma: PrismaService,
    private openai: OpenAiProvider,
    private gemini: GeminiProvider,
    private anthropic: AnthropicProvider,
    @Inject(REDIS_CLIENT) private redis: Redis,
    private systemConfig: SystemConfigService,
  ) {
    this.providers.set(this.openai.getName(), this.openai);
    this.providers.set(this.gemini.getName(), this.gemini);
    this.providers.set(this.anthropic.getName(), this.anthropic);
  }

  async generateExplanation(
    hadithText: string,
    hadithId: number,
    collection: string,
    language: string,
  ): Promise<ExplanationResult> {
    if (!await this.systemConfig.isFeatureEnabled('feature_ai_enabled')) {
      throw new ServiceUnavailableException('AI explanations are temporarily unavailable');
    }
    const providerName = await this.getActiveProviderName();
    const provider = this.providers.get(providerName) || this.openai;

    this.logger.log(`Generating explanation for hadith ${hadithId} using ${provider.getName()} in ${language}`);

    try {
      return await provider.generateExplanation(hadithText, collection, language);
    } catch (error: any) {
      this.logger.error(`AI Provider ${providerName} failed: ${error.message}`);
      // Fallback to OpenAI if primary fails
      if (providerName !== 'openai') {
        this.logger.warn(`Attempting fallback to openai...`);
        return await this.openai.generateExplanation(hadithText, collection, language);
      }
      throw error;
    }
  }

  async streamExplanation(
    hadithText: string,
    collection: string,
    language: string,
  ): Promise<ReadableStream<any>> {
    if (!await this.systemConfig.isFeatureEnabled('feature_ai_enabled')) {
      throw new ServiceUnavailableException('AI explanations are temporarily unavailable');
    }
    const providerName = await this.getActiveProviderName();
    const provider = this.providers.get(providerName) || this.openai;

    this.logger.log(`Streaming explanation for using ${provider.getName()} in ${language}`);

    if (!provider.streamExplanation) {
        throw new Error(`Provider ${providerName} does not support streaming.`);
    }

    try {
      return await provider.streamExplanation(hadithText, collection, language);
    } catch (error: any) {
      this.logger.error(`AI Provider streaming failed: ${error.message}`);
      if (providerName !== 'openai' && this.openai.streamExplanation) {
          return await this.openai.streamExplanation(hadithText, collection, language);
      }
      throw error;
    }
  }

  private async getActiveProviderName(): Promise<string> {
    try {
      // Prisma usually maps SystemSetting to systemSetting
      const setting = await (this.prisma as any).systemSetting.findUnique({
        where: { key: 'active_ai_provider' },
      });
      return setting?.value || 'openai';
    } catch (e) {
      return 'openai';
    }
  }
  
  async setActiveProvider(provider: 'openai' | 'gemini' | 'anthropic'): Promise<void> {
      await (this.prisma as any).systemSetting.upsert({
          where: { key: 'active_ai_provider' },
          create: { key: 'active_ai_provider', value: provider },
          update: { value: provider }
      });
  }

  async setActiveVectorProvider(provider: 'openai' | 'gemini'): Promise<void> {
    await (this.prisma as any).systemSetting.upsert({
        where: { key: 'active_vector_provider' },
        create: { key: 'active_vector_provider', value: provider },
        update: { value: provider }
    });
    this.cachedVectorProvider = provider; // сбрасываем in-memory кэш
  }

  private async getActiveVectorProviderName(): Promise<string> {
    if (this.cachedVectorProvider) return this.cachedVectorProvider;
    try {
      const setting = await (this.prisma as any).systemSetting.findUnique({
        where: { key: 'active_vector_provider' },
      });
      this.cachedVectorProvider = setting?.value || 'gemini';
      return this.cachedVectorProvider!;
    } catch (e) {
      return 'gemini';
    }
  }

  /**
   * Generates vector embeddings for a given text.
   * Can use a different provider than the main explanation AI to optimize costs.
   */
  async generateEmbedding(text: string): Promise<number[]> {
    // Кэшируем эмбеддинги в Redis по SHA-256 хешу запроса (TTL 7 дней)
    const hash = createHash('sha256').update(text.trim().toLowerCase()).digest('hex');
    const cacheKey = `embedding:v2:${hash}`;

    try {
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        this.logger.debug(`Embedding cache HIT for key ${cacheKey.slice(0, 20)}...`);
        return JSON.parse(cached) as number[];
      }
    } catch (e) {
      // Redis недоступен — продолжаем без кэша
    }

    const providerName = await this.getActiveVectorProviderName();
    const provider = this.providers.get(providerName) || this.gemini;

    try {
      let embedding = await provider.generateEmbedding(text);
      // Force dimension to 768 to match the database schema
      if (embedding.length !== 768) {
        this.logger.warn(`Provider ${providerName} returned ${embedding.length} dimensions. Truncating to 768.`);
        embedding = embedding.slice(0, 768);
      }
      this.logger.log(`Generated embedding with ${providerName}. Final Dimension: ${embedding.length}`);

      // Сохраняем в Redis на 7 дней
      try {
        await this.redis.set(cacheKey, JSON.stringify(embedding), 'EX', 60 * 60 * 24 * 7);
      } catch (e) {}

      return embedding;
    } catch (error: any) {
      this.logger.error(`Failed to generate embedding with ${providerName}: ${error.message}`);
      throw error;
    }
  }
}
