import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { AiProvider, ExplanationResult } from '../interfaces/ai-provider.interface';

@Injectable()
export class AnthropicProvider implements AiProvider {
  private anthropic: Anthropic;

  constructor(private configService: ConfigService) {
    this.anthropic = new Anthropic({
      apiKey: this.configService.get<string>('ANTHROPIC_API_KEY'),
    });
  }

  getName(): string {
    return 'anthropic';
  }

  async generateExplanation(
    hadithText: string,
    collection: string,
    language: string,
  ): Promise<ExplanationResult> {
    const model = 'claude-3-haiku-20240307';
    
    const response = await this.anthropic.messages.create({
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

  private getSystemPrompt(language: string): string {
    const languageInstruction = language === 'uz' 
        ? 'Отвечай строго на языке запроса (узбекский), используя латиницу.' 
        : `Отвечай строго на языке запроса: ${language}.`;

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

Выдай ответ СТРОГО в формате JSON, где каждое значение — это ОДНА ПЛОСКАЯ СТРОКА (string):
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
