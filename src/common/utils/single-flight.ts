/**
 * SingleFlight implementation for NestJS/TypeScript.
 * Prevents multiple concurrent executions of the same asynchronous operation.
 */
export class SingleFlight {
  private inFlight = new Map<string, Promise<any>>();

  async do<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const existing = this.inFlight.get(key);
    if (existing) {
      return existing;
    }

    const promise = fn().finally(() => {
      this.inFlight.delete(key);
    });

    this.inFlight.set(key, promise);
    return promise;
  }
}

// Global instance if needed, or inject via NestJS
export const globalSingleFlight = new SingleFlight();
