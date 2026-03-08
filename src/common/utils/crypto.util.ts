import * as crypto from 'crypto';
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
    // 32 bytes = 64 hex chars. Total length = 9 + 64 = 73
    const random = crypto.randomBytes(32).toString('hex');
    return `sk_mumin_${random}`;
}

/**
 * Get API key prefix for display
 */
export function getKeyPrefix(apiKey: string): string {
    return apiKey.substring(0, 15);
}
