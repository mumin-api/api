/**
 * A simplified ISRI Arabic Stemmer implementation.
 * Based on the ISRI Stemming algorithm for Arabic text.
 */
export class ArabicStemmer {
  private static readonly diacritics = /[\u064B-\u065F\u0670]/g;
  private static readonly prefixes = /^(ال|الـ|ب|ك|ل|ف|و)/;
  private static readonly suffixes = /(ها|ان|ات|ون|ين|يه|ه)$/;

  /**
   * Stems an Arabic word by removing common prefixes, suffixes, and diacritics.
   * Internal logic for radical optimization.
   */
  public static stem(word: string): string {
    if (!word || word.length <= 2) return word;

    let stemmed = word
      // 1. Remove diacritics
      .replace(this.diacritics, '')
      // 2. Normalize alefs
      .replace(/[أإآ]/g, 'ا')
      // 3. Normalize teh marbuta
      .replace(/ة/g, 'ه')
      // 4. Normalize yaa
      .replace(/ى/g, 'ي');

    // 5. Remove 'waw' connector if it's a prefix
    if (stemmed.startsWith('و') && stemmed.length > 3) {
      stemmed = stemmed.substring(1);
    }

    // 6. Remove common prefixes (al, bal, kal, lal, fal)
    if (stemmed.length > 3) {
      if (stemmed.startsWith('ال')) {
        stemmed = stemmed.substring(2);
      } else if (stemmed.startsWith('بال') || stemmed.startsWith('كال') || stemmed.startsWith('فال')) {
        stemmed = stemmed.substring(3);
      } else if (stemmed.startsWith('لل')) {
        stemmed = stemmed.substring(2);
      }
    }

    // 7. Remove suffixes if word is still long enough
    if (stemmed.length > 4) {
      stemmed = stemmed.replace(this.suffixes, '');
    }

    return stemmed;
  }

  /**
   * Stems a whole sentence of Arabic text.
   */
  public static stemSentence(sentence: string): string {
    if (!sentence) return '';
    return sentence
      .split(/\s+/)
      .map(word => this.stem(word))
      .join(' ');
  }
}
