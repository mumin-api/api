import { Test, TestingModule } from '@nestjs/testing';
import { BillingService } from './billing.service';
import { PrismaService } from '@/prisma/prisma.service';

describe('BillingService', () => {
    let service: BillingService;
    let prisma: any;

    const mockPrisma = {
        user: {
            findUnique: jest.fn(),
        },
        transaction: {
            findMany: jest.fn(),
            count: jest.fn(),
        },
        payment: {
            findMany: jest.fn(),
        },
        requestLog: {
            count: jest.fn(),
        },
        apiKey: {
            findFirst: jest.fn(),
        },
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                BillingService,
                { provide: PrismaService, useValue: mockPrisma },
            ],
        }).compile();

        service = module.get<BillingService>(BillingService);
        prisma = module.get(PrismaService);
    });

    describe('getBalanceByUserEmail', () => {
        it('should return correct balance and stats for a user', async () => {
            const mockUser = {
                id: 1,
                email: 'test@example.com',
                balance: 500,
                totalRequests: 1000,
                totalDataTransferred: 5000000,
            };
            mockPrisma.user.findUnique.mockResolvedValue(mockUser);
            mockPrisma.requestLog.count.mockResolvedValue(50); // 50 requests today

            const result = await service.getBalanceByUserEmail('test@example.com');

            expect(result.balance).toBe(500);
            expect(result.requestsToday).toBe(50);
            expect(result.totalRequests).toBe(1000);
            expect(mockPrisma.user.findUnique).toHaveBeenCalled();
        });

        it('should return default values if user not found', async () => {
            mockPrisma.user.findUnique.mockResolvedValue(null);

            const result = await service.getBalanceByUserEmail('notfound@example.com');

            expect(result.balance).toBe(0);
            expect(result.requestsToday).toBe(0);
        });
    });

    describe('getTransactions', () => {
        it('should return paginated transactions', async () => {
            const mockTxs = [
                { id: 1, amount: -1, type: 'search', createdAt: new Date() },
            ];
            mockPrisma.transaction.findMany.mockResolvedValue(mockTxs);
            mockPrisma.transaction.count.mockResolvedValue(1);

            const result = await service.getTransactions(1);

            expect(result.data).toHaveLength(1);
            expect(result.pagination.total).toBe(1);
            expect(mockPrisma.transaction.findMany).toHaveBeenCalled();
        });
    });
});
