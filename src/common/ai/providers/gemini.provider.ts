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
    const modelName = 'gemini-1.5-flash';
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
      benefit: content.benefit || '',
      sources: content.sources || '',
      model: modelName,
      provider: this.getName(),
    };
  }

  private getSystemPrompt(language: string): string {
    const languageInstruction = language === 'uz' 
        ? 'Отвечай строго на языке запроса (узбекский), используя латиницу.' 
        : `Отвечай строго на языке запроса: ${language}.`;

    return `Ты — эксперт-мухаддис, который объясняет хадисы простым языком на основе классических шархов (например, Фатх аль-Бари). Твоя задача — передать смысл, не искажая правовой статус (хукм).
При объяснении опирайся исключительно на признанных ученых: Имам ан-Навави, Ибн Хаджар, Бадр уд-Дин аль-Айни. Избегай современных политических или спорных трактовок.
Если не знаешь ответа то так и скажи, не галюцинируй и не придумывай ничего. Точный ответ ценнее чем твои фантазии.

${languageInstruction}

Выдай ответ СТРОГО в формате JSON со следующей структурой:
{
  "meaning": "Краткий смысл аята/хадиса",
  "benefit": "Польза (файдо) для верующего",
  "sources": "Источник шарха"
}`;
  }
}
