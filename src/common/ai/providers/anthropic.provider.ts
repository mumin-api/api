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
