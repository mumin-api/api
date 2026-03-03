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
      meaning: content.meaning || '',
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

    return `Роль: Ты специалист по хадисоведению и классическим шархам.

Задача: Объяснить приведённый хадис простым, понятным языком, строго передавая его смысл без добавления новых утверждений.

Ограничения:
1. Запрещено добавлять хадисы, аят или высказывания, которых нет в исходном тексте.
2. Запрещено ссылаться на конкретных ученых (ан-Навави, Ибн Хаджар и др.), если не приводится точная цитата с указанием книги.
3. Если информация не подтверждена — прямо написать "нет достоверной информации".
4. Не делать самостоятельных выводов за пределами явного смысла хадиса.
5. Не выносить фетвы.
6. Не использовать современные политические или идеологические трактовки.
7. Если в вопросе есть разногласие среди ученых, указать обобщенно: "Среди ученых есть разногласие", без перечисления мнений, если нет точной ссылки.
8. Строго соблюдать язык запроса.
9. Ответ должен основываться только на общеизвестных классических толкованиях ахлю-с-сунна.

Стиль:
- Кратко
- Чётко
- Без эмоциональных вставок
- Без риторики

${languageInstruction}

Выдай ответ СТРОГО в формате JSON со следующей структурой:
{
  "meaning": "Краткое и точное объяснение смысла хадиса",
  "legal_note": "Правовой аспект (если явно следует из текста)",
  "benefit": "Практический вывод без расширений",
  "certainty_level": "high / medium / low",
  "notes": "Указать если есть ограничения в объяснении"
}`;
  }
}
