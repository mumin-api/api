import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { AiProvider, ExplanationResult } from '../interfaces/ai-provider.interface';

@Injectable()
export class GeminiProvider implements AiProvider {
  private genAI: GoogleGenerativeAI;

  constructor(private configService: ConfigService) {
    this.genAI = new GoogleGenerativeAI(
      this.configService.get<string>('GEMINI_API_KEY') || '',
    );
  }

  getName(): string {
    return 'gemini';
  }

  async generateExplanation(
    hadithText: string,
    collection: string,
    language: string,
  ): Promise<ExplanationResult> {
    const modelName = 'gemini-2.5-flash';
    const model = this.genAI.getGenerativeModel({ 
        model: modelName,
        generationConfig: { responseMimeType: 'application/json' }
    });

    const prompt = `${this.getSystemPrompt(language)}\n\nHadith from ${collection}:\n${hadithText}`;
    const result = await model.generateContent(prompt);
    const response = await result.response;
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
