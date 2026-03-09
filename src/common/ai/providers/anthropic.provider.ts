import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { AiProvider, ExplanationResult } from '../interfaces/ai-provider.interface';

@Injectable()
export class AnthropicProvider implements AiProvider {
  private anthropic: Anthropic | null = null;
  private readonly logger = new Logger(AnthropicProvider.name);

  constructor(private configService: ConfigService) {}

  private getClient(): Anthropic {
    if (this.anthropic) return this.anthropic;

    const apiKey = this.configService.get<string>('ANTHROPIC_API_KEY');
    if (!apiKey) {
      this.logger.error('ANTHROPIC_API_KEY is not set in environment variables');
      throw new Error('Missing credentials. Please pass an `apiKey`, or set the `ANTHROPIC_API_KEY` environment variable.');
    }

    this.anthropic = new Anthropic({
      apiKey,
    });
    return this.anthropic;
  }

  getName(): string {
    return 'anthropic';
  }

  async generateExplanation(
    hadithText: string,
    collection: string,
    language: string,
  ): Promise<ExplanationResult> {
    const model = 'claude-4.5-haiku';
    
    const response = await this.getClient().messages.create({
      model: model,
      max_tokens: 1024,
      system: this.getSystemPrompt(language),
      messages: [
        {
          role: 'user',
          content: `Hadith from ${collection}:\n${hadithText}`,
        },
      ],
    });

    // Claude usually returns text, we need to parse JSON from it
    const textContent = response.content[0].type === 'text' ? response.content[0].text : '{}';
    const content = JSON.parse(textContent);

    return {
      short_meaning: content.short_meaning || '',
      long_meaning: content.long_meaning || '',
      context: content.context || '',
      legal_note: content.legal_note || '',
      benefit: content.benefit || '',
      certainty_level: content.certainty_level || 'medium',
      notes: content.notes || '',
      model: model,
      provider: this.getName(),
    };
  }

  async streamExplanation(
    hadithText: string,
    collection: string,
    language: string,
  ): Promise<ReadableStream<any>> {
    const model = 'claude-4.5-haiku';
    
    // Anthropic streaming uses messages.stream() or just messages.create({ stream: true })
    const stream = await this.getClient().messages.create({
      model: model,
      max_tokens: 1024,
      system: this.getSystemPrompt(language),
      messages: [
        {
          role: 'user',
          content: `Hadith from ${collection}:\n${hadithText}`,
        },
      ],
      stream: true,
    });

    return new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
              controller.enqueue(new TextEncoder().encode(chunk.delta.text));
            }
          }
          controller.close();
        } catch (e) {
          controller.error(e);
        }
      }
    });
  }

  async generateEmbedding(text: string): Promise<number[]> {
    throw new Error('Anthropic does not provide an embedding API yet. Please use Gemini or OpenAI.');
  }

  private getSystemPrompt(language: string): string {
    const languageNames: Record<string, string> = {
      ru: 'Russian (Русский)',
      uz: 'Uzbek (O\'zbek tili, Latin script)',
      tr: 'Turkish (Türkçe)',
      en: 'English',
      ar: 'Arabic (العربية)',
    };

    const languageName = languageNames[language] || language;
    const languageInstruction = `CRITICAL: You MUST provide the content of all JSON fields STRICTLY in the ${languageName} language. DO NOT use any other language for the values.`;

    return `Роль: Ты специалист по хадисоведению и классическим шархам (например, Фатх аль-Бари, Шарх ан-Навави).

Задача: Дать комплексное и точное объяснение хадиса, объединяя лаконичность для быстрого ознакомления и глубину для детального изучения.

Ограничения:
1. Запрещено добавлять посторонние хадисы или аяты, если они не являются частью прямого толкования данного текста в классических шархах.
2. ТЕРМИНОЛОГИЯ: При объяснении терминов (например, "гулюль", "тахара") давай только точные лексические и шариатские определения из классических словарей. Запрещены современные или личные трактовки.
4. КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО использовать Markdown форматирование (жирный шрифт **, курсив _, заголовки и т.д.). Текст должен быть только обычным (plain text).
5. Не выносить самостоятельных фетв и не делай политических заявлений.
6. Если информация по какому-то пункту отсутствует в классике — напиши "Нет достоверной информации".

Стиль и Структура (Золотая середина):
- Тон: Академичный, мудрый, лаконичный. Пиши емко, но выразительно.
- short_meaning: Суть 1 мощным предложением.
- long_meaning: Компактный разбор (2-4 предложения). Избегай вводных фраз. Сразу к сути.
- context: Если терминов несколько, используй короткий список. 1 фраза на термин.
- benefit: 1 яркое предложение о практической или духовной пользе.

${languageInstruction}

Выдай ответ СТРОГО в формате JSON, где каждое значение — это ОДНА ПЛОСКАЯ СТРОКА (string) на языке ${languageName}:
{
  "short_meaning": "Краткий и точный смысл хадиса (для быстрого чтения)",
  "long_meaning": "Развёрнутое и глубокое объяснение со всеми нюансами",
  "context": "Точное определение терминов или исторический контекст",
  "legal_note": "Правовые или богословские выводы из классических шархов",
  "benefit": "Духовная и практическая польза для мусульманина",
  "certainty_level": "high / medium / low",
  "notes": "Важные ограничения или нюансы в понимании"
}`;
  }
}
