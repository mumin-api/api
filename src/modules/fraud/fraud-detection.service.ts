import { Injectable, Logger, Inject } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '@/common/redis/redis.module';

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
    private readonly TRACKING_WINDOW_MS = 60 * 1000; // 1 minute
    private readonly MAX_TRACKED_REQUESTS = 100;

    constructor(
        private prisma: PrismaService,
        @Inject(REDIS_CLIENT) private redis: Redis,
    ) { }

    async checkRequest(req: FraudCheckRequest): Promise<FraudCheckResult> {
        // 1. Track request in Redis (Async, don't block)
        this.trackRequestInRedis(req).catch(e => this.logger.error('Redis tracking failed', e));

        // 2. Run checks
        const checks = [
            this.checkScrapingDensity(req.apiKeyId),
            this.checkRapidRequests(req.apiKeyId),
            this.checkIpBehavior(req.ipAddress),
            this.checkHoneypotHit(req.endpoint),
            this.checkSuspiciousUserAgent(req.userAgent),
        ];

        const results = await Promise.all(checks);

        // Find highest severity issue
        const suspiciousResults = results.filter((r) => r.isSuspicious);

        if (suspiciousResults.length === 0) {
            return { isSuspicious: false };
        }

        // Return most severe issue
        const critical = suspiciousResults.find((r) => r.severity === 'critical');
        if (critical) {
            critical.shouldAutoSuspend = true;
            return critical;
        }

        const high = suspiciousResults.find((r) => r.severity === 'high');
        if (high) {
            high.shouldAutoSuspend = false;
            return high;
        }

        const medium = suspiciousResults.find((r) => r.severity === 'medium');
        if (medium) {
            medium.shouldAutoSuspend = false;
            return medium;
        }

        return suspiciousResults[0];
    }

    /**
     * Track request metadata in Redis ZSETs for high-speed analysis
     */
    private async trackRequestInRedis(req: FraudCheckRequest): Promise<void> {
        const now = Date.now();
        const key = `fraud:track:key:${req.apiKeyId}`;
        const ipKey = `fraud:track:ip:${req.ipAddress}`;
        
        // Extract hadith ID if applicable
        const hadithMatch = req.endpoint.match(/\/v1\/hadiths\/(\d+)/);
        const hadithId = hadithMatch ? hadithMatch[1] : 'none';

        // Store as: timestamp:hadithId
        const value = `${now}:${hadithId}`;

        const pipeline = this.redis.pipeline();
        
        // Track by API Key
        pipeline.zadd(key, now, value);
        pipeline.zremrangebyscore(key, 0, now - this.TRACKING_WINDOW_MS);
        pipeline.expire(key, 300); // 5 mins TTL

        // Track by IP
        pipeline.zadd(ipKey, now, value);
        pipeline.zremrangebyscore(ipKey, 0, now - this.TRACKING_WINDOW_MS);
        pipeline.expire(ipKey, 300);

        await pipeline.exec();
    }

    /**
     * Detect scraping density (distinct content accessed in window)
     * Harder to bypass than simple +1 sequential check
     */
    private async checkScrapingDensity(apiKeyId: number): Promise<FraudCheckResult> {
        const key = `fraud:track:key:${apiKeyId}`;
        const entries = await this.redis.zrange(key, 0, -1);
        
        if (entries.length < 20) return { isSuspicious: false };

        const distinctHadiths = new Set(
            entries
                .map(e => e.split(':')[1])
                .filter(id => id !== 'none')
        );

        // If user accessed 30+ distinct hadiths in 60s, it's likely a scraper
        if (distinctHadiths.size > 30) {
            return {
                isSuspicious: true,
                type: 'scraping_density',
                severity: 'high',
                reason: 'High volume of distinct content accessed in short window',
                evidence: { distinctCount: distinctHadiths.size, windowMs: this.TRACKING_WINDOW_MS },
            };
        }

        return { isSuspicious: false };
    }

    /**
     * Detect rapid-fire requests using Redis ZSET (Real-time)
     */
    private async checkRapidRequests(apiKeyId: number): Promise<FraudCheckResult> {
        const key = `fraud:track:key:${apiKeyId}`;
        const count = await this.redis.zcard(key);

        if (count < 50) return { isSuspicious: false };

        const entries = await this.redis.zrange(key, 0, -1);
        const timestamps = entries.map(e => parseInt(e.split(':')[0]));
        
        const first = timestamps[0];
        const last = timestamps[timestamps.length - 1];
        const duration = last - first;
        const avgInterval = duration / timestamps.length;

        if (avgInterval < 100) { // < 100ms avg interval
            return {
                isSuspicious: true,
                type: 'rapid_requests',
                severity: 'high',
                reason: 'Extremely rapid request rate detected via Redis analyzer',
                evidence: { avgIntervalMs: Math.round(avgInterval), count },
            };
        }

        return { isSuspicious: false };
    }

    /**
     * Detect suspicious behavior by IP address
     */
    private async checkIpBehavior(ipAddress: string): Promise<FraudCheckResult> {
        const ipKey = `fraud:track:ip:${ipAddress}`;
        const count = await this.redis.zcard(ipKey);

        // Allow slightly more for IP because multiple users might share a NAT
        if (count > 200) { 
            return {
                isSuspicious: true,
                type: 'ip_volumetric_anomaly',
                severity: 'medium',
                reason: 'High request volume from a single IP address',
                evidence: { ipCount: count },
            };
        }

        return { isSuspicious: false };
    }

    /**
     * Check if honeypot endpoint was accessed (Static, fast)
     */
    private async checkHoneypotHit(endpoint: string): Promise<FraudCheckResult> {
        const honeypots = [
            '/v1/hadiths/all',
            '/v1/admin/keys', 
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
     */
    private async checkSuspiciousUserAgent(userAgent: string): Promise<FraudCheckResult> {
        const suspiciousPatterns = [
            /curl/i, /wget/i, /python-requests/i, /scrapy/i, /bot/i, /spider/i, /crawl/i,
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
        } catch (error) {
            this.logger.error('Failed to log fraud event:', error);
        }
    }

    /**
     * Update trust score based on fraud events (Atomic update)
     */
    async updateTrustScore(apiKeyId: number, fraudType: string): Promise<void> {
        const penalties: Record<string, number> = {
            honeypot_hit: 20,
            scraping_density: 15,
            rapid_requests: 10,
            suspicious_user_agent: 5,
        };

        const penalty = penalties[fraudType] || 5;

        // Atomic decrement in Prisma
        const updated = await this.prisma.apiKey.update({
            where: { id: apiKeyId },
            data: { 
                trustScore: {
                    decrement: penalty
                }
            },
            select: { trustScore: true }
        });

        // Ensure trust score doesn't go below 0 (Prisma doesn't easily support min(0, val-x) in one update)
        // but we can fix it if it happens or just let it be (business choice)
        if (updated.trustScore < 0) {
            await this.prisma.apiKey.update({
                where: { id: apiKeyId },
                data: { trustScore: 0 }
            });
        }

        this.logger.log(`Trust score atomized for key ${apiKeyId}. Penalty: -${penalty}. New score: ${updated.trustScore}`);
    }
}
