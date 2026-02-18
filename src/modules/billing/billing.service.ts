import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { BillingStats, CryptoPayInvoice, CryptoPayWebhook } from './billing.types';
import axios from 'axios';
import * as crypto from 'crypto';

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

    async getUsageStats(userId: number): Promise<BillingStats> {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { balance: true }
        });

        if (!user) throw new BadRequestException('User not found');

        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        const [daily, monthly] = await Promise.all([
            this.prisma.requestLog.count({
                where: {
                    userId,
                    timestamp: { gte: startOfDay }
                }
            }),
            this.prisma.requestLog.count({
                where: {
                    userId,
                    timestamp: { gte: startOfMonth }
                }
            })
        ]);

        return {
            dailyRequests: daily,
            monthlyRequests: monthly,
            balance: user.balance
        };
    }

    /**
     * Get daily usage stats for the last N days (real data from RequestLog)
     */
    async getUsageByDay(userId: number, days: number = 7): Promise<{ date: string; requests: number }[]> {
        const since = new Date();
        since.setDate(since.getDate() - (days - 1));
        since.setHours(0, 0, 0, 0);

        // Raw SQL: group RequestLog by date for this user
        const rows = await this.prisma.$queryRaw<{ date: string; requests: bigint }[]>`
            SELECT
                TO_CHAR(DATE_TRUNC('day', timestamp AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS date,
                COUNT(*)::bigint AS requests
            FROM request_logs
            WHERE user_id = ${userId}
              AND timestamp >= ${since}
            GROUP BY DATE_TRUNC('day', timestamp AT TIME ZONE 'UTC')
            ORDER BY DATE_TRUNC('day', timestamp AT TIME ZONE 'UTC') ASC
        `;

        // Build a full 7-day array (fill missing days with 0)
        const result: { date: string; requests: number }[] = [];
        for (let i = 0; i < days; i++) {
            const d = new Date();
            d.setDate(d.getDate() - (days - 1 - i));
            const dateStr = d.toISOString().split('T')[0];
            const found = rows.find(r => r.date === dateStr);
            result.push({ date: dateStr, requests: found ? Number(found.requests) : 0 });
        }

        return result;
    }

    async createCryptoInvoice(userId: number, amount: number) {
        const token = process.env.CRYPTO_PAY_TOKEN;
        const isTestnet = process.env.CRYPTO_PAY_NET === 'testnet';
        const baseUrl = isTestnet 
            ? 'https://testnet-pay.cryptobot.pay/api' 
            : 'https://pay.cryptobot.pay/api';

        if (!token) {
            throw new BadRequestException('CryptoBot payment is not configured on server.');
        }

        try {
            // Crypto Pay API createInvoice
            // Credits are 1:1 with currency for now (e.g. 1 USD = 1 Credit)
            // But we can adjust multiplier.
            const response = await axios.post(`${baseUrl}/createInvoice`, {
                asset: 'USDT',
                amount: amount.toString(),
                description: `Top up Mumin API - ${amount} credits`,
                paid_btn_name: 'callback',
                paid_btn_url: 'https://t.me/mumin_hadith_bot', // Redirect back to bot
            }, {
                headers: { 'Crypto-Pay-API-Token': token }
            });

            const invoice: CryptoPayInvoice = response.data.result;

            // Save pending payment
            await this.prisma.payment.create({
                data: {
                    userId,
                    provider: 'cryptobot',
                    providerPaymentId: invoice.invoice_id.toString(),
                    amount: amount,
                    currency: invoice.asset,
                    credits: amount, // 1:1
                    status: 'PENDING',
                    invoiceUrl: invoice.pay_url,
                    metadata: invoice as any,
                }
            });

            return {
                invoiceUrl: invoice.pay_url,
                invoiceId: invoice.invoice_id
            };
        } catch (error: any) {
            this.logger.error('Failed to create CryptoBot invoice:', error.response?.data || error.message);
            throw new BadRequestException('Failed to generate payment link. Try again later.');
        }
    }

    async handleCryptoWebhook(payload: CryptoPayWebhook, signature: string) {
        const token = process.env.CRYPTO_PAY_TOKEN;
        if (!token) throw new BadRequestException('Payment not configured');

        // 1. Verify Signature
        const secret = crypto.createHash('sha256').update(token).digest();
        const checkString = JSON.stringify(payload);
        const hmac = crypto.createHmac('sha256', secret).update(checkString).digest('hex');

        if (hmac !== signature) {
            this.logger.warn('Invalid CryptoBot signature received');
            throw new BadRequestException('Invalid signature');
        }

        if (payload.update_type !== 'invoice_paid') {
            return { success: true, message: 'Ignoring non-payment update' };
        }

        const invoice = payload.payload;

        // 2. Find Payment
        const payment = await this.prisma.payment.findUnique({
            where: { providerPaymentId: invoice.invoice_id.toString() },
            include: { user: true }
        });

        if (!payment) {
            this.logger.error(`Payment not found for invoice ${invoice.invoice_id}`);
            throw new BadRequestException('Payment record not found');
        }

        if (payment.status === 'PAID') {
            return { success: true, message: 'Already processed' };
        }

        // 3. Complete Payment & Add Credits
        const amount = Number(invoice.amount);
        
        await this.prisma.$transaction([
            this.prisma.payment.update({
                where: { id: payment.id },
                data: {
                    status: 'PAID',
                    completedAt: new Date(),
                    metadata: invoice as any
                }
            }),
            this.prisma.user.update({
                where: { id: payment.userId },
                data: { balance: payment.user.balance + payment.credits }
            }),
            this.prisma.transaction.create({
                data: {
                    userId: payment.userId,
                    paymentId: payment.id,
                    type: 'top_up',
                    amount: payment.credits,
                    balanceBefore: payment.user.balance,
                    balanceAfter: payment.user.balance + payment.credits,
                    description: `CryptoBot payment #${invoice.invoice_id} (${invoice.asset})`
                }
            })
        ]);

        this.logger.log(`✅ Payment COMPLETED: user ${payment.userId}, credits +${payment.credits}`);

        return { success: true };
    }
}
