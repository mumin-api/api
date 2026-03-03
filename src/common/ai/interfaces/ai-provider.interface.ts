export interface ExplanationResult {
  meaning: string;
  legal_note: string;
  benefit: string;
  certainty_level: string;
  notes: string;
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
