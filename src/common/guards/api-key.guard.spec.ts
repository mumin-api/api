import { Test, TestingModule } from '@nestjs/testing';
import { ApiKeyGuard } from './api-key.guard';
import { PrismaService } from '@/prisma/prisma.service';
import { ExecutionContext, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { EmailService } from '@/modules/email/email.service';
import { FraudDetectionService } from '@/modules/fraud/fraud-detection.service';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

describe('ApiKeyGuard', () => {
    let guard: ApiKeyGuard;
    let prisma: any;
    let redis: any;

    const mockPrisma = {
        apiKey: {
            findUnique: jest.fn(),
            update: jest.fn(),
        },
        user: {
            update: jest.fn(),
        },
        requestLog: {
            count: jest.fn(),
            create: jest.fn(),
        },
    };

    const mockRedis = {
        zadd: jest.fn(),
        zremrangebyscore: jest.fn(),
        zcard: jest.fn(),
        mget: jest.fn(),
        get: jest.fn(),
        set: jest.fn(),
        expire: jest.fn(),
    };

    const mockEmailService = {
        sendBalanceLowWarning: jest.fn(),
        sendAccountSuspended: jest.fn(),
    };

    const mockFraudService = {
        checkRequest: jest.fn().mockResolvedValue({ isSuspicious: false }),
        logFraudEvent: jest.fn(),
        updateTrustScore: jest.fn(),
    };

    const mockConfigService = {
        get: jest.fn().mockImplementation((key: string) => {
            if (key === 'ADMIN_API_KEY') return 'test-admin-key';
            return null;
        }),
    };

    const mockReflector = {
        getAllAndOverride: jest.fn(),
    };

    beforeEach(async () => {
        jest.resetAllMocks();
        mockReflector.getAllAndOverride.mockReturnValue(false);
        mockFraudService.checkRequest.mockResolvedValue({ isSuspicious: false });
        
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                ApiKeyGuard,
                { provide: PrismaService, useValue: mockPrisma },
                { provide: 'REDIS_CLIENT', useValue: mockRedis },
                { provide: EmailService, useValue: mockEmailService },
                { provide: FraudDetectionService, useValue: mockFraudService },
                { provide: ConfigService, useValue: mockConfigService },
                { provide: Reflector, useValue: mockReflector },
            ],
        }).compile();

        guard = module.get<ApiKeyGuard>(ApiKeyGuard);
        prisma = module.get(PrismaService);
        redis = module.get('REDIS_CLIENT');
    });

    it('should throw UnauthorizedException if no API key is provided', async () => {
        const context = {
            switchToHttp: () => ({
                getRequest: () => ({ headers: { method: 'GET' } }),
            }),
            getHandler: () => ({}),
            getClass: () => ({}),
        } as unknown as ExecutionContext;

        await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException if API key is invalid', async () => {
        const invalidKey = 'sk_mumin_' + 'b'.repeat(32);
        const context = {
            switchToHttp: () => ({
                getRequest: () => ({ headers: { 'x-api-key': invalidKey } }),
            }),
            getHandler: () => ({}),
            getClass: () => ({}),
        } as unknown as ExecutionContext;

        mockPrisma.apiKey.findUnique.mockResolvedValue(null);

        await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
    });

    it('should allow request and update balance atomically', async () => {
        const validKey = 'sk_mumin_' + 'a'.repeat(32);
        const context = {
            switchToHttp: () => ({
                getRequest: () => ({ 
                    headers: { 'x-api-key': validKey },
                    ip: '127.0.0.1',
                    method: 'GET',
                    url: '/test'
                }),
            }),
            getHandler: () => ({}),
            getClass: () => ({}),
        } as unknown as ExecutionContext;

        const mockKey = {
            id: 1,
            keyHash: 'hashed',
            keyPrefix: 'sk_mumin_',
            isActive: true,
            userEmail: 'test@example.com',
            user: { 
                id: 101, 
                email: 'test@example.com',
                balance: 100, 
                totalRequests: 50,
                lowBalanceAlerts: true,
                lowBalanceAlertSent: false
            },
            createdAt: new Date(),
            allowedIPs: [],
            fraudFlags: [],
            maxDailyRequests: 500,
            suspendedAt: null,
            suspendReason: null,
        };

        mockPrisma.apiKey.findUnique.mockResolvedValue(mockKey);
        mockRedis.zcard.mockResolvedValue(0); // No recent requests (Shield OK)

        const result = await guard.canActivate(context);

        expect(result).toBe(true);
        expect(mockPrisma.user.update).toHaveBeenCalledWith({
            where: { id: 101 },
            data: {
                balance: { decrement: 1 },
                totalRequests: { increment: 1 },
            },
        });
    });

    it('should throw ForbiddenException if account is suspended', async () => {
        const validKey = 'sk_mumin_' + 'c'.repeat(32);
        const context = {
            switchToHttp: () => ({
                getRequest: () => ({ headers: { 'x-api-key': validKey } }),
            }),
            getHandler: () => ({}),
            getClass: () => ({}),
        } as unknown as ExecutionContext;

        mockPrisma.apiKey.findUnique.mockResolvedValue({
            id: 1,
            keyPrefix: 'sk_mumin_',
            isActive: false,
            suspendedAt: new Date(),
            suspendReason: 'Testing',
            user: { id: 101 },
            allowedIPs: [],
            fraudFlags: [],
            maxDailyRequests: 500,
            createdAt: new Date(),
        });

        await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
    });
});
