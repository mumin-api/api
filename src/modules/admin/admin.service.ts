import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { BillingService } from '@/modules/billing/billing.service';

@Injectable()
export class AdminService {
    private readonly logger = new Logger(AdminService.name);

    constructor(
        private prisma: PrismaService,
        private billingService: BillingService,
    ) { }

    /**
     * List all API keys with filtering
     */
    async listKeys(page: number = 1, limit: number = 50, filters?: any) {
        const skip = (page - 1) * limit;
        const where: any = {};

        if (filters?.isActive !== undefined) where.isActive = filters.isActive;
        if (filters?.email) where.userEmail = { contains: filters.email };

        const [keys, total] = await Promise.all([
            this.prisma.apiKey.findMany({
                where,
                skip,
                take: limit,
                orderBy: { createdAt: 'desc' },
                select: {
                    id: true,
                    keyPrefix: true,
                    userEmail: true,
                    user: {
                        select: {
                            balance: true,
                            totalRequests: true,
                        }
                    },
                    isActive: true,
                    suspendedAt: true,
                    suspendReason: true,
                    createdAt: true,
                    lastUsedAt: true,
                    trustScore: true,
                    fraudFlags: true,
                },
            }),
            this.prisma.apiKey.count({ where }),
        ]);

        const totalPages = Math.ceil(total / limit);

        return {
            data: keys.map(k => ({
                ...k,
                balance: k.user?.balance ?? 0,
                totalRequests: Number(k.user?.totalRequests ?? 0),
                user: undefined,
            })),
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
     * Get detailed key information
     */
    async getKeyDetails(id: number) {
        const key = await this.prisma.apiKey.findUnique({
            where: { id },
            include: {
                requestLogs: {
                    take: 100,
                    orderBy: { timestamp: 'desc' },
                },
                transactions: {
                    take: 50,
                    orderBy: { createdAt: 'desc' },
                },
                fraudEvents: {
                    orderBy: { timestamp: 'desc' },
                },
            },
        });

        if (!key) {
            throw new NotFoundException(`API key with ID ${id} not found`);
        }

        return key;
    }

    /**
     * Suspend account
     */
    async suspendAccount(id: number, reason: string) {
        await this.prisma.apiKey.update({
            where: { id },
            data: {
                suspendedAt: new Date(),
                suspendReason: reason,
                isActive: false,
            },
        });

        this.logger.log(`Account ${id} suspended: ${reason}`);

        return { message: 'Account suspended successfully' };
    }

    /**
     * Unsuspend account
     */
    async unsuspendAccount(id: number) {
        await this.prisma.apiKey.update({
            where: { id },
            data: {
                suspendedAt: null,
                suspendReason: null,
                isActive: true,
            },
        });

        this.logger.log(`Account ${id} unsuspended`);

        return { message: 'Account unsuspended successfully' };
    }

    /**
     * Add balance to account
     */
    async addBalance(id: number, amount: number, description: string) {
        const key = await this.prisma.apiKey.findUnique({
            where: { id },
        });

        if (!key) {
            throw new NotFoundException(`API key with ID ${id} not found`);
        }

        return this.billingService.addCredits(key.userId, amount, description);
    }

    /**
     * Get fraud events
     */
    async getFraudEvents(page: number = 1, limit: number = 50) {
        const skip = (page - 1) * limit;

        const [events, total] = await Promise.all([
            this.prisma.fraudEvent.findMany({
                skip,
                take: limit,
                orderBy: { timestamp: 'desc' },
                include: {
                    apiKey: {
                        select: {
                            keyPrefix: true,
                            userEmail: true,
                        },
                    },
                },
            }),
            this.prisma.fraudEvent.count(),
        ]);

        const totalPages = Math.ceil(total / limit);

        return {
            data: events,
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
     * Get system statistics
     */
    async getStats() {
        const [
            totalKeys,
            activeKeys,
            suspendedKeys,
            totalRequests,
            totalFraudEvents,
            recentRegistrations,
        ] = await Promise.all([
            this.prisma.apiKey.count(),
            this.prisma.apiKey.count({ where: { isActive: true } }),
            this.prisma.apiKey.count({ where: { suspendedAt: { not: null } } }),
            this.prisma.requestLog.count(),
            this.prisma.fraudEvent.count(),
            this.prisma.apiKey.count({
                where: {
                    createdAt: {
                        gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
                    },
                },
            }),
        ]);

        return {
            totalKeys,
            activeKeys,
            suspendedKeys,
            totalRequests,
            totalFraudEvents,
            recentRegistrations,
        };
    }
}
