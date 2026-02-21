import { Test, TestingModule } from '@nestjs/testing';
import { FraudDetectionService } from './fraud-detection.service';
import { PrismaService } from '@/prisma/prisma.service';
import { REDIS_CLIENT } from '@/common/redis/redis.module';

describe('FraudDetectionService', () => {
    let service: FraudDetectionService;
    let prisma: any;
    let redis: any;

    const mockPrisma = {
        apiKey: {
            update: jest.fn(),
        },
        fraudEvent: {
            create: jest.fn(),
        },
    };

    const mockRedis = {
        pipeline: jest.fn().mockReturnValue({
            zadd: jest.fn().mockReturnThis(),
            zremrangebyscore: jest.fn().mockReturnThis(),
            expire: jest.fn().mockReturnThis(),
            exec: jest.fn().mockResolvedValue([]),
        }),
        zrange: jest.fn(),
        zcard: jest.fn(),
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                FraudDetectionService,
                { provide: PrismaService, useValue: mockPrisma },
                { provide: REDIS_CLIENT, useValue: mockRedis },
            ],
        }).compile();

        service = module.get<FraudDetectionService>(FraudDetectionService);
        prisma = module.get(PrismaService);
        redis = module.get(REDIS_CLIENT);
    });

    describe('checkHoneypotHit', () => {
        it('should return suspicious for honeypot endpoints', async () => {
            const result = await (service as any).checkHoneypotHit('/v1/admin/keys');
            expect(result.isSuspicious).toBe(true);
            expect(result.severity).toBe('critical');
        });

        it('should return not suspicious for normal endpoints', async () => {
            const result = await (service as any).checkHoneypotHit('/v1/hadiths/123');
            expect(result.isSuspicious).toBe(false);
        });
    });

    describe('checkSuspiciousUserAgent', () => {
        it('should detect python-requests', async () => {
            const result = await (service as any).checkSuspiciousUserAgent('python-requests/2.28.1');
            expect(result.isSuspicious).toBe(true);
            expect(result.type).toBe('suspicious_user_agent');
        });

        it('should allow normal browser user agent', async () => {
            const result = await (service as any).checkSuspiciousUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
            expect(result.isSuspicious).toBe(false);
        });
    });

    describe('updateTrustScore', () => {
        it('should atomically decrement trust score', async () => {
            mockPrisma.apiKey.update.mockResolvedValue({ trustScore: 80 });

            await service.updateTrustScore(1, 'rapid_requests');

            expect(mockPrisma.apiKey.update).toHaveBeenCalledWith(expect.objectContaining({
                data: { trustScore: { decrement: 10 } }
            }));
        });
    });
});
