import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';

interface FraudCheckRequest {
    apiKeyId: number;
    ipAddress: string;
    userAgent: string;
    endpoint: string;
}

interface FraudCheckResult {
    isSuspicious: boolean;
    type?: string;
    severity?: 'low' | 'medium' | 'high' | 'critical';
    reason?: string;
    evidence?: any;
    shouldAutoSuspend?: boolean;
}

@Injectable()
export class FraudDetectionService {
    private readonly logger = new Logger(FraudDetectionService.name);

    constructor(private prisma: PrismaService) { }

    async checkRequest(req: FraudCheckRequest): Promise<FraudCheckResult> {
        const checks = [
            this.checkSequentialAccess(req.apiKeyId),
            this.checkRapidRequests(req.apiKeyId),
            this.checkHoneypotHit(req.endpoint),
            this.checkSuspiciousUserAgent(req.userAgent),
        ];

        const results = await Promise.all(checks);

        // Find highest severity issue
        const suspiciousResults = results.filter((r) => r.isSuspicious);

        if (suspiciousResults.length === 0) {
            return { isSuspicious: false };
        }

        // Return most severe issue (CRITICAL auto-suspends, MEDIUM/HIGH flags only)
        const critical = suspiciousResults.find((r) => r.severity === 'critical');
        if (critical) {
            critical.shouldAutoSuspend = true;
            return critical;
        }

        const high = suspiciousResults.find((r) => r.severity === 'high');
        if (high) {
            high.shouldAutoSuspend = false; // Flag only, no auto-suspend
            return high;
        }

        const medium = suspiciousResults.find((r) => r.severity === 'medium');
        if (medium) {
            medium.shouldAutoSuspend = false; // Flag only, no auto-suspend
            return medium;
        }

        return suspiciousResults[0];
    }

    /**
     * Detect sequential hadith ID access (scraper pattern)
     * Severity: HIGH (flag only, no auto-suspend)
     */
    private async checkSequentialAccess(apiKeyId: number): Promise<FraudCheckResult> {
        const recentRequests = await this.prisma.requestLog.findMany({
            where: {
                apiKeyId,
                endpoint: { startsWith: '/v1/hadiths/' },
            },
            orderBy: { timestamp: 'desc' },
            take: 50,
        });

        if (recentRequests.length < 10) {
            return { isSuspicious: false };
        }

        // Extract hadith IDs from endpoints
        const ids = recentRequests
            .map((r) => {
                const match = r.endpoint.match(/\/v1\/hadiths\/(\d+)/);
                return match ? parseInt(match[1]) : null;
            })
            .filter((id) => id !== null)
            .reverse(); // Chronological order

        // Check if sequential
        let sequentialCount = 0;
        for (let i = 1; i < ids.length; i++) {
            if (ids[i] === ids[i - 1] + 1) {
                sequentialCount++;
            }
        }

        const sequentialPercentage = sequentialCount / ids.length;

        if (sequentialPercentage > 0.7) {
            // 70%+ sequential
            return {
                isSuspicious: true,
                type: 'sequential_access',
                severity: 'high',
                reason: 'Sequential hadith access detected (likely scraper)',
                evidence: {
                    sequentialPercentage: Math.round(sequentialPercentage * 100),
                    sampleIds: ids.slice(0, 10),
                },
            };
        }

        return { isSuspicious: false };
    }

    /**
     * Detect rapid-fire requests (bot pattern)
     * Severity: HIGH (flag only, no auto-suspend)
     */
    private async checkRapidRequests(apiKeyId: number): Promise<FraudCheckResult> {
        const last100 = await this.prisma.requestLog.findMany({
            where: { apiKeyId },
            orderBy: { timestamp: 'desc' },
            take: 100,
            select: { timestamp: true },
        });

        if (last100.length < 50) {
            return { isSuspicious: false };
        }

        // Calculate average interval
        const intervals = [];
        for (let i = 1; i < last100.length; i++) {
            const interval = last100[i - 1].timestamp.getTime() - last100[i].timestamp.getTime();
            intervals.push(interval);
        }

        const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;

        // If average interval < 100ms = likely bot
        if (avgInterval < 100) {
            return {
                isSuspicious: true,
                type: 'rapid_requests',
                severity: 'high',
                reason: 'Extremely rapid request rate detected',
                evidence: {
                    avgIntervalMs: Math.round(avgInterval),
                    requestsAnalyzed: last100.length,
                },
            };
        }

        return { isSuspicious: false };
    }

    /**
     * Check if honeypot endpoint was accessed
     * Severity: CRITICAL (auto-suspend)
     */
    private async checkHoneypotHit(endpoint: string): Promise<FraudCheckResult> {
        const honeypots = [
            '/v1/hadiths/all',
            '/v1/admin/keys', // If accessed without admin key
            '/v1/hadiths/bulk',
            '/v1/internal/',
        ];

        if (honeypots.some((h) => endpoint.includes(h))) {
            return {
                isSuspicious: true,
                type: 'honeypot_hit',
                severity: 'critical',
                reason: 'Accessed honeypot endpoint',
                evidence: { endpoint },
            };
        }

        return { isSuspicious: false };
    }

    /**
     * Check for suspicious user agents
     * Severity: MEDIUM (flag only, no auto-suspend)
     */
    private async checkSuspiciousUserAgent(userAgent: string): Promise<FraudCheckResult> {
        const suspiciousPatterns = [
            /curl/i,
            /wget/i,
            /python-requests/i,
            /scrapy/i,
            /bot/i,
            /spider/i,
            /crawl/i,
        ];

        if (suspiciousPatterns.some((pattern) => pattern.test(userAgent))) {
            return {
                isSuspicious: true,
                type: 'suspicious_user_agent',
                severity: 'medium',
                reason: 'Suspicious user agent detected',
                evidence: { userAgent },
            };
        }

        return { isSuspicious: false };
    }

    /**
     * Log fraud event to database
     */
    async logFraudEvent(
        apiKeyId: number,
        result: FraudCheckResult,
        ipAddress: string,
        actionTaken: string,
    ): Promise<void> {
        try {
            await this.prisma.fraudEvent.create({
                data: {
                    apiKeyId,
                    eventType: result.type || 'unknown',
                    severity: result.severity || 'low',
                    description: result.reason || 'No description',
                    evidence: result.evidence,
                    actionTaken,
                    ipAddress,
                },
            });

            this.logger.warn(
                `Fraud event logged: ${result.type} (${result.severity}) - Action: ${actionTaken}`,
            );
        } catch (error) {
            this.logger.error('Failed to log fraud event:', error);
        }
    }

    /**
     * Update trust score based on fraud events
     */
    async updateTrustScore(apiKeyId: number, fraudType: string): Promise<void> {
        const apiKey = await this.prisma.apiKey.findUnique({
            where: { id: apiKeyId },
            select: { trustScore: true },
        });

        if (!apiKey) return;

        // Decrease trust score based on fraud type
        const penalties: Record<string, number> = {
            honeypot_hit: -20,
            sequential_access: -10,
            rapid_requests: -10,
            suspicious_user_agent: -5,
        };

        const penalty = penalties[fraudType] || -5;
        const newScore = Math.max(0, apiKey.trustScore + penalty);

        await this.prisma.apiKey.update({
            where: { id: apiKeyId },
            data: { trustScore: newScore },
        });

        this.logger.log(`Trust score updated for key ${apiKeyId}: ${apiKey.trustScore} → ${newScore}`);
    }
}
