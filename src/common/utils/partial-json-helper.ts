/**
 * A simple utility to repair partial JSON strings emitted by AI models.
 * For a flat object structure, it adds missing quotes and braces.
 */
export class PartialJsonHelper {
  /**
   * Attempts to "fix" a partial JSON string to make it parsable.
   * This is specialized for flat objects with string values.
   */
  static repair(partialJson: string): any {
    if (!partialJson) return {};
    
    let json = partialJson.trim();
    
    // 1. If it doesn't start with {, add it (though usually it does)
    if (!json.startsWith('{')) json = '{' + json;
    
    try {
      // 2. Try parsing immediately (might be complete)
      return JSON.parse(json);
    } catch (e) {
      // It's partial. Let's try to close it.
    }

    // 3. Very basic "closer":
    // Find if we are in a string value or a key
    const quoteCount = (json.match(/"/g) || []).length;
    
    let repaired = json;
    
    // If quoteCount is odd, we are inside a string. Close it.
    if (quoteCount % 2 !== 0) {
      repaired += '"';
    }
    
    // Close the object
    repaired += '}';
    
    try {
      return JSON.parse(repaired);
    } catch (e) {
      // If still failing, it might be in the middle of a key or empty
      // We can return an object as far as we parsed it, but for simplicity:
      return this.fallbackParse(json);
    }
  }

  /**
   * More aggressive parsing for very broken chunks
   */
  private static fallbackParse(json: string): any {
    const result: Record<string, string> = {};
    
    // Regex to match "key": "value" pairs
    // Note: This won't catch the very last partial value easily
    const regex = /"([^"]+)":\s*"([^"]*)/g;
    let match;
    
    while ((match = regex.exec(json)) !== null) {
      result[match[1]] = match[2];
    }
    
    return result;
  }
}
