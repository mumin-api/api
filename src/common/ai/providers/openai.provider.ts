import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { AiProvider, ExplanationResult } from '../interfaces/ai-provider.interface';

@Injectable()
export class OpenAiProvider implements AiProvider {
  private client: OpenAI | null = null;
  private readonly logger = new Logger(OpenAiProvider.name);

  constructor(private configService: ConfigService) {}

  private getClient(): OpenAI {
    if (this.client) return this.client;

    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    if (!apiKey) {
      this.logger.error('OPENAI_API_KEY is not set in environment variables');
      throw new Error('Missing credentials. Please pass an `apiKey`, or set the `OPENAI_API_KEY` environment variable.');
    }

    this.client = new OpenAI({
      apiKey,
    });
    return this.client;
  }

  getName(): string {
    return 'openai';
  }

  async generateExplanation(
    hadithText: string,
    collection: string,
    language: string,
  ): Promise<ExplanationResult> {
    const model = 'o4-mini';
    
    const response = await this.getClient().chat.completions.create({
      model: model,
      messages: [
        {
          role: 'system',
          content: this.getSystemPrompt(language),
        },
        {
          role: 'user',
          content: `Hadith from ${collection}:\n${hadithText}`,
        },
      ],
      response_format: { type: 'json_object' },
    });

    const content = JSON.parse(response.choices[0].message.content || '{}');

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
    const model = 'o4-mini';
    
    const stream = await this.getClient().chat.completions.create({
      model: model,
      messages: [
        {
          role: 'system',
          content: this.getSystemPrompt(language),
        },
        {
          role: 'user',
          content: `Hadith from ${collection}:\n${hadithText}`,
        },
      ],
      response_format: { type: 'json_object' },
      stream: true,
    });

    return new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content;
            if (content) {
              controller.enqueue(new TextEncoder().encode(content));
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
    const response = await this.getClient().embeddings.create({
      model: 'text-embedding-3-small',
      input: text,
    });
    return response.data[0].embedding;
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
5. Не выноси самостоятельных фетв и не делай политических заявлений.
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
