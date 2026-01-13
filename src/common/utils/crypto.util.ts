import { createHash } from 'crypto';

/**
 * Generate device fingerprint from request components
 */
export function generateFingerprint(components: string[]): string {
    const combined = components.filter(Boolean).join('|');
    return createHash('sha256').update(combined).digest('hex');
}

/**
 * Hash API key for storage
 */
export function hashApiKey(apiKey: string): string {
    return createHash('sha256').update(apiKey).digest('hex');
}

/**
 * Generate random API key
 */
export function generateApiKey(): string {
    const randomPart = createHash('sha256')
        .update(Date.now().toString() + Math.random().toString())
        .digest('hex')
        .substring(0, 32);

    return `sk_mumin_${randomPart}`;
}

/**
 * Get API key prefix for display
 */
export function getKeyPrefix(apiKey: string): string {
    return apiKey.substring(0, 15);
}
