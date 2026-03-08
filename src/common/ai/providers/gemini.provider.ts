import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { AiProvider, ExplanationResult } from '../interfaces/ai-provider.interface';

@Injectable()
export class GeminiProvider implements AiProvider {
  private readonly logger = new Logger(GeminiProvider.name);
  private genAIs: GoogleGenerativeAI[] = [];
  private vectorAIs: GoogleGenerativeAI[] = [];
  private currentGenIndex = 0;
  private currentVectorIndex = 0;

  constructor(private configService: ConfigService) {
    const mainKeys = (this.configService.get<string>('GEMINI_API_KEY') || '').split(',').map(k => k.trim()).filter(k => k);
    const vectorKeysRaw = this.configService.get<string>('VECTOR_API_KEY') || '';
    const vectorKeys = vectorKeysRaw ? vectorKeysRaw.split(',').map(k => k.trim()).filter(k => k) : mainKeys;

    this.genAIs = mainKeys.length > 0 ? mainKeys.map(key => new GoogleGenerativeAI(key)) : [new GoogleGenerativeAI('')];
    this.vectorAIs = vectorKeys.length > 0 ? vectorKeys.map(key => new GoogleGenerativeAI(key)) : [new GoogleGenerativeAI('')];
  }

  getName(): string {
    return 'gemini';
  }

  private async runWithRotation<T>(
    instances: GoogleGenerativeAI[],
    indexRef: { index: number },
    operation: (instance: GoogleGenerativeAI) => Promise<T>
  ): Promise<T> {
    const startIdx = indexRef.index;
    let lastError: any;

    for (let i = 0; i < instances.length; i++) {
      const currentIdx = (startIdx + i) % instances.length;
      const instance = instances[currentIdx];
      
      try {
        const result = await operation(instance);
        indexRef.index = currentIdx; // Persist successful index for next time
        return result;
      } catch (error: any) {
        lastError = error;
        // Check for 429 / quota or 404 / not found errors to rotate
        const errMsg = error.message?.toLowerCase() || '';
        if (
          errMsg.includes('429') || 
          errMsg.includes('quota') || 
          errMsg.includes('404') || 
          errMsg.includes('not found')
        ) {
          this.logger.warn(`Gemini key index ${currentIdx} hit an error (${errMsg.substring(0, 50)}...). Rotating to next key...`);
          continue;
        }
        throw error; // Immediate fail for other errors
      }
    }
    throw lastError; // All keys exhausted
  }

  async generateExplanation(
    hadithText: string,
    collection: string,
    language: string,
  ): Promise<ExplanationResult> {
    const result = await this.runWithRotation(this.genAIs, { index: this.currentGenIndex }, async (instance) => {
      const modelName = 'gemini-3.1-flash-lite-preview';
      const model = instance.getGenerativeModel({ 
          model: modelName,
          generationConfig: { responseMimeType: 'application/json' }
      });

      const prompt = `${this.getSystemPrompt(language)}\n\nHadith from ${collection}:\n${hadithText}`;
      const genResult = await model.generateContent(prompt);
      const response = await genResult.response;
      const content = JSON.parse(response.text() || '{}');

      return {
        short_meaning: content.short_meaning || '',
        long_meaning: content.long_meaning || '',
        context: content.context || '',
        legal_note: content.legal_note || '',
        benefit: content.benefit || '',
        certainty_level: content.certainty_level || 'medium',
        notes: content.notes || '',
        model: modelName,
        provider: this.getName(),
      };
    });

    this.currentGenIndex = (this.currentGenIndex + 1) % this.genAIs.length;
    return result;
  }

  async streamExplanation(
    hadithText: string,
    collection: string,
    language: string,
  ): Promise<ReadableStream<any>> {
      const instance = this.genAIs[this.currentGenIndex];
      const modelName = 'gemini-3.1-flash-lite-preview';
      const model = instance.getGenerativeModel({ 
          model: modelName,
          generationConfig: { responseMimeType: 'application/json' }
      });

      const prompt = `${this.getSystemPrompt(language)}\n\nHadith from ${collection}:\n${hadithText}`;
      const streamResult = await model.generateContentStream(prompt);
      
      return streamResult.stream as unknown as ReadableStream<any>;
  }

  async generateEmbedding(text: string): Promise<number[]> {
    const result = await this.runWithRotation(this.vectorAIs, { index: this.currentVectorIndex }, async (instance) => {
      // Switched to gemini-embedding-001 based on diagnostic results
      const model = instance.getGenerativeModel({ model: 'models/gemini-embedding-001' });
      const embedResult = await model.embedContent(text);
      return embedResult.embedding.values.slice(0, 768);
    });

    this.currentVectorIndex = (this.currentVectorIndex + 1) % this.vectorAIs.length;
    return result;
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
3. ЦИТИРОВАНИЕ: Категорически запрещено указывать конкретные названия книг, тома или страницы, если ты не можешь гарантировать 100% точность цитаты. Допускаются обобщенные отсылки ("Ученые указывают...", "В комментариях поясняется...").
4. КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО использовать Markdown форматирование (жирный шрифт **, курсив _, заголовки и т.д.). Текст должен быть только обычным (plain text).
5. Если информация по какому-то пункту отсутствует в классике — напиши "Нет достоверной информации".

Стиль и Структура (Золотая середина):
- Тон: Академичный, мудрый, лаконичный. Пиши емко, но выразительно.
- short_meaning: Суть 1 мощным предложением.
- long_meaning: Компактный разбор (2-4 предложения). Избегай вводных фраз типа "Данный хадис говорит нам о том, что...". Сразу к сути.
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
