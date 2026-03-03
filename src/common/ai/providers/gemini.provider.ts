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
      meaning: content.meaning || '',
      legal_note: content.legal_note || '',
      benefit: content.benefit || '',
      certainty_level: content.certainty_level || 'medium',
      notes: content.notes || '',
      model: modelName,
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
