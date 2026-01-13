import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';

@Injectable()
export class BillingService {
    private readonly logger = new Logger(BillingService.name);

    constructor(private prisma: PrismaService) { }

    /**
     * Get balance for API key
     */
    async getBalance(apiKeyId: number) {
        const key = await this.prisma.apiKey.findUnique({
            where: { id: apiKeyId },
            select: {
                balance: true,
                totalRequests: true,
                totalDataTransferred: true,
            },
        });

        return {
            balance: key?.balance || 0,
            totalRequests: key?.totalRequests || 0,
            totalDataTransferred: key?.totalDataTransferred || 0,
        };
    }

    /**
     * Get transaction history
     */
    async getTransactions(apiKeyId: number, page: number = 1, limit: number = 50) {
        const skip = (page - 1) * limit;

        const [transactions, total] = await Promise.all([
            this.prisma.transaction.findMany({
                where: { apiKeyId },
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
            }),
            this.prisma.transaction.count({ where: { apiKeyId } }),
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
    async getPayments(apiKeyId: number) {
        return this.prisma.payment.findMany({
            where: { apiKeyId },
            orderBy: { createdAt: 'desc' },
        });
    }

    /**
     * Add credits to account (manual top-up)
     */
    async addCredits(apiKeyId: number, amount: number, description: string) {
        const key = await this.prisma.apiKey.findUnique({
            where: { id: apiKeyId },
        });

        if (!key) {
            throw new Error('API key not found');
        }

        await this.prisma.$transaction([
            this.prisma.apiKey.update({
                where: { id: apiKeyId },
                data: { balance: key.balance + amount },
            }),
            this.prisma.transaction.create({
                data: {
                    apiKeyId,
                    type: 'top_up',
                    amount,
                    balanceBefore: key.balance,
                    balanceAfter: key.balance + amount,
                    description,
                },
            }),
        ]);

        this.logger.log(`Added ${amount} credits to API key ${key.keyPrefix}`);

        return {
            balance: key.balance + amount,
            message: `Successfully added ${amount} credits`,
        };
    }
}
