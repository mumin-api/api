import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '@/prisma/prisma.service';
import { EmailService } from '@/modules/email/email.service';
import { subDays } from 'date-fns';

@Injectable()
export class InactivityCronService {
    private readonly logger = new Logger(InactivityCronService.name);

    constructor(
        private prisma: PrismaService,
        private emailService: EmailService,
    ) { }

    /**
     * Check for inactive accounts daily at 2 AM
     */
    @Cron(CronExpression.EVERY_DAY_AT_2AM)
    async checkInactiveAccounts(): Promise<void> {
        this.logger.log('Running inactivity check (User-centric)...');

        // Find users inactive for 335 days
        const warningDate = subDays(new Date(), 335);

        // We find users where ALL their keys are inactive
        const usersNeedingWarning = await this.prisma.user.findMany({
            where: {
                balance: { gt: 0 },
                apiKeys: {
                    every: {
                        lastActivityDate: { lt: warningDate },
                    }
                },
                // We'll track warnings at the user level or just pick the primary key for emails
            },
            include: {
                apiKeys: {
                    orderBy: { lastActivityDate: 'desc' },
                    take: 1
                }
            }
        });

        this.logger.log(`Found ${usersNeedingWarning.length} users potentially needing warnings`);

        for (const user of usersNeedingWarning) {
            const latestKey = user.apiKeys[0];
            if (!latestKey) continue;

            // Check if warning already sent (using the latest key's tracking for now)
            if (latestKey.inactivityWarnings === 0) {
                try {
                    await this.emailService.sendInactivityWarning({
                        userEmail: user.email,
                        keyPrefix: latestKey.keyPrefix,
                    } as any, 30);

                    await this.prisma.apiKey.update({
                        where: { id: latestKey.id },
                        data: { inactivityWarnings: 1 },
                    });
                    this.logger.log(`Sent 30-day warning to user ${user.email}`);
                } catch (error) {
                    this.logger.error(`Failed to send warning to ${user.email}:`, error);
                }
            }
        }

        // Logic for 7-day warning and dormancy...
        const secondWarningDate = subDays(new Date(), 358);
        const usersNeedingSecondWarning = await this.prisma.user.findMany({
            where: {
                balance: { gt: 0 },
                apiKeys: {
                    every: {
                        lastActivityDate: { lt: secondWarningDate },
                        inactivityWarnings: 1
                    }
                }
            },
            include: {
                apiKeys: { orderBy: { lastActivityDate: 'desc' }, take: 1 }
            }
        });

        for (const user of usersNeedingSecondWarning) {
            const latestKey = user.apiKeys[0];
            if (!latestKey) continue;

            try {
                await this.emailService.sendInactivityWarning({
                    userEmail: user.email,
                    keyPrefix: latestKey.keyPrefix,
                } as any, 7);

                await this.prisma.apiKey.update({
                    where: { id: latestKey.id },
                    data: { inactivityWarnings: 2 },
                });
                this.logger.log(`Sent 7-day warning to user ${user.email}`);
            } catch (error) {
                this.logger.error(`Failed to send second warning to ${user.email}:`, error);
            }
        }

        // Dormancy check (365 days)
        const dormantDate = subDays(new Date(), 365);
        const usersBecomingDormant = await this.prisma.user.findMany({
            where: {
                apiKeys: {
                    every: {
                        lastActivityDate: { lt: dormantDate },
                        dormantAt: null
                    }
                },
                balance: { gt: 10 }
            },
            include: {
                apiKeys: { orderBy: { lastActivityDate: 'desc' }, take: 1 }
            }
        });

        for (const user of usersBecomingDormant) {
            const latestKey = user.apiKeys[0];
            if (!latestKey) continue;

            try {
                await this.prisma.apiKey.update({
                    where: { id: latestKey.id },
                    data: { dormantAt: new Date() },
                });

                await this.chargeInactivityFee(user);
                this.logger.log(`Marked user ${user.email} as dormant`);
            } catch (error) {
                this.logger.error(`Failed to process dormant user ${user.email}:`, error);
            }
        }
    }

    /**
     * Charge monthly inactivity fee for dormant accounts
     */
    @Cron(CronExpression.EVERY_1ST_DAY_OF_MONTH_AT_MIDNIGHT)
    async chargeMonthlyInactivityFees(): Promise<void> {
        this.logger.log('Charging monthly inactivity fees...');

        const dormantUsers = await this.prisma.user.findMany({
            where: {
                apiKeys: {
                    some: { dormantAt: { not: null } }
                },
                balance: { gt: 0 },
            }
        });

        this.logger.log(`Found ${dormantUsers.length} dormant users to charge`);

        for (const user of dormantUsers) {
            await this.chargeInactivityFee(user);
        }
    }

    private async chargeInactivityFee(user: any): Promise<void> {
        const feeAmount = 5000; // $5 = 5000 credits

        if (user.balance < feeAmount) {
            // Balance too low, suspend account
            await this.prisma.user.update({
                where: { id: user.id },
                data: {
                    balance: 0,
                },
            });

            // Suspend all keys
            await this.prisma.apiKey.updateMany({
                where: { userId: user.id },
                data: {
                    isActive: false,
                    suspendedAt: new Date(),
                    suspendReason: 'Balance depleted due to inactivity fees',
                }
            });

            this.logger.log(`Suspended user ${user.email} - balance depleted`);
            return;
        }

        // Charge fee
        await this.prisma.$transaction([
            // Deduct balance from User
            this.prisma.user.update({
                where: { id: user.id },
                data: { balance: user.balance - feeAmount },
            }),

            // Log transaction
            this.prisma.transaction.create({
                data: {
                    userId: user.id,
                    type: 'inactivity_fee',
                    amount: -feeAmount,
                    balanceBefore: user.balance,
                    balanceAfter: user.balance - feeAmount,
                    description: 'Monthly inactivity fee ($5)',
                },
            }),
        ]);

        this.logger.log(`Charged $5 inactivity fee to ${user.email}. New balance: ${user.balance - feeAmount}`);
    }
}
