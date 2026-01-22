import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';

@Injectable()
export class BillingService {
    private readonly logger = new Logger(BillingService.name);

    constructor(private prisma: PrismaService) { }

    /**
     * Get balance for User
     */
    async getBalance(userId: number) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: {
                balance: true,
                totalRequests: true,
                totalDataTransferred: true,
            },
        });

        return {
            balance: user?.balance || 0,
            totalRequests: user?.totalRequests ? Number(user.totalRequests) : 0,
            totalDataTransferred: user?.totalDataTransferred ? Number(user.totalDataTransferred) : 0,
        };
    }

    async getApiKeyIdByEmail(email: string): Promise<number | null> {
        const key = await this.prisma.apiKey.findFirst({
            where: { userEmail: email },
            select: { id: true },
        });
        return key?.id || null;
    }

    async getBalanceByUserEmail(email: string) {
        const user = await this.prisma.user.findUnique({
            where: { email },
            select: {
                id: true,
                balance: true,
                totalRequests: true,
                totalDataTransferred: true,
            },
        });

        // Calculate today's requests across all API keys for this user
        let requestsToday = 0;
        if (user) {
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            requestsToday = await this.prisma.requestLog.count({
                where: {
                    userId: user.id,
                    timestamp: { gte: today },
                },
            });
        }

        return {
            balance: user?.balance || 0,
            requestsToday,
            totalRequests: user?.totalRequests ? Number(user.totalRequests) : 0,
            totalDataTransferred: user?.totalDataTransferred ? Number(user.totalDataTransferred) : 0,
        };
    }

    /**
     * Get transaction history
     */
    async getTransactions(userId: number, page: number = 1, limit: number = 50) {
        const skip = (page - 1) * limit;

        const [transactions, total] = await Promise.all([
            this.prisma.transaction.findMany({
                where: { userId },
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
            }),
            this.prisma.transaction.count({ where: { userId } }),
        ]);

        const totalPages = Math.ceil(total / limit);

        return {
            data: transactions,
            pagination: {
                page,
                limit,
                total,
                totalPages,
                hasNext: page < totalPages,
                hasPrev: page > 1,
            },
        };
    }

    /**
     * Get payment history
     */
    async getPayments(userId: number) {
        return this.prisma.payment.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
        });
    }

    /**
     * Add credits to account (manual top-up)
     */
    async addCredits(userId: number, amount: number, description: string) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
        });

        if (!user) {
            throw new Error('User not found');
        }

        await this.prisma.$transaction([
            this.prisma.user.update({
                where: { id: userId },
                data: { balance: user.balance + amount },
            }),
            this.prisma.transaction.create({
                data: {
                    userId,
                    type: 'top_up',
                    amount,
                    balanceBefore: user.balance,
                    balanceAfter: user.balance + amount,
                    description,
                },
            }),
        ]);

        this.logger.log(`Added ${amount} credits to User ${user.email}`);

        return {
            balance: user.balance + amount,
            message: `Successfully added ${amount} credits`,
        };
    }
}
