import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { AiProvider, ExplanationResult } from '../interfaces/ai-provider.interface';

@Injectable()
export class OpenAiProvider implements AiProvider {
  private client: OpenAI;

  constructor(private configService: ConfigService) {
    this.client = new OpenAI({
      apiKey: this.configService.get<string>('OPENAI_API_KEY'),
    });
  }

  getName(): string {
    return 'openai';
  }

  async generateExplanation(
    hadithText: string,
    collection: string,
    language: string,
  ): Promise<ExplanationResult> {
    const model = 'gpt-4o-mini';
    
    const response = await this.client.chat.completions.create({
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
      meaning: content.meaning || '',
      benefit: content.benefit || '',
      sources: content.sources || '',
      model: model,
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
