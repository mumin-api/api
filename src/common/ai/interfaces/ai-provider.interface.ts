export interface ExplanationResult {
  meaning: string;
  benefit: string;
  sources: string;
  model: string;
  provider: string;
}

export interface AiProvider {
  getName(): string;
  generateExplanation(
    hadithText: string,
    collection: string,
    language: string,
  ): Promise<ExplanationResult>;
}
