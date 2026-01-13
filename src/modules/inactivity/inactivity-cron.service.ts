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
        this.logger.log('Running inactivity check...');

        // Find accounts inactive for 335 days (30 days before 365)
        const warningDate = subDays(new Date(), 335);

        const accountsNeedingWarning = await this.prisma.apiKey.findMany({
            where: {
                lastActivityDate: { lt: warningDate },
                balance: { gt: 0 },
                inactivityWarnings: 0,
                isActive: true,
                userEmail: { not: null },
            },
        });

        this.logger.log(`Found ${accountsNeedingWarning.length} accounts needing first warning`);

        // Send first warning (30 days before dormant)
        for (const key of accountsNeedingWarning) {
            try {
                await this.emailService.sendInactivityWarning(key, 30);
                await this.prisma.apiKey.update({
                    where: { id: key.id },
                    data: { inactivityWarnings: 1 },
                });
                this.logger.log(`Sent 30-day warning to ${key.userEmail}`);
            } catch (error) {
                this.logger.error(`Failed to send warning to ${key.userEmail}:`, error);
            }
        }

        // Find accounts needing second warning (7 days before dormant)
        const secondWarningDate = subDays(new Date(), 358);

        const accountsNeedingSecondWarning = await this.prisma.apiKey.findMany({
            where: {
                lastActivityDate: { lt: secondWarningDate },
                balance: { gt: 0 },
                inactivityWarnings: 1,
                isActive: true,
                userEmail: { not: null },
            },
        });

        this.logger.log(`Found ${accountsNeedingSecondWarning.length} accounts needing second warning`);

        for (const key of accountsNeedingSecondWarning) {
            try {
                await this.emailService.sendInactivityWarning(key, 7);
                await this.prisma.apiKey.update({
                    where: { id: key.id },
                    data: { inactivityWarnings: 2 },
                });
                this.logger.log(`Sent 7-day warning to ${key.userEmail}`);
            } catch (error) {
                this.logger.error(`Failed to send second warning to ${key.userEmail}:`, error);
            }
        }

        // Find accounts that became dormant (365 days)
        const dormantDate = subDays(new Date(), 365);

        const dormantAccounts = await this.prisma.apiKey.findMany({
            where: {
                lastActivityDate: { lt: dormantDate },
                balance: { gt: 10 }, // Exempt small balances
                dormantAt: null,
                isActive: true,
            },
        });

        this.logger.log(`Found ${dormantAccounts.length} newly dormant accounts`);

        for (const key of dormantAccounts) {
            try {
                // Mark as dormant
                await this.prisma.apiKey.update({
                    where: { id: key.id },
                    data: { dormantAt: new Date() },
                });

                // Charge first inactivity fee
                await this.chargeInactivityFee(key);

                this.logger.log(`Marked account ${key.userEmail} as dormant`);
            } catch (error) {
                this.logger.error(`Failed to process dormant account ${key.userEmail}:`, error);
            }
        }
    }

    /**
     * Charge monthly inactivity fee for dormant accounts
     */
    @Cron(CronExpression.EVERY_1ST_DAY_OF_MONTH_AT_MIDNIGHT)
    async chargeMonthlyInactivityFees(): Promise<void> {
        this.logger.log('Charging monthly inactivity fees...');

        const dormantAccounts = await this.prisma.apiKey.findMany({
            where: {
                dormantAt: { not: null },
                balance: { gt: 0 },
                isActive: true,
            },
        });

        this.logger.log(`Found ${dormantAccounts.length} dormant accounts to charge`);

        for (const key of dormantAccounts) {
            await this.chargeInactivityFee(key);
        }
    }

    private async chargeInactivityFee(key: any): Promise<void> {
        const feeAmount = 5000; // $5 = 5000 credits

        if (key.balance < feeAmount) {
            // Balance too low, close account
            await this.prisma.apiKey.update({
                where: { id: key.id },
                data: {
                    balance: 0,
                    isActive: false,
                    suspendedAt: new Date(),
                    suspendReason: 'Balance depleted due to inactivity fees',
                },
            });

            this.logger.log(`Closed account ${key.userEmail} - balance depleted`);
            return;
        }

        // Charge fee
        await this.prisma.$transaction([
            // Deduct balance
            this.prisma.apiKey.update({
                where: { id: key.id },
                data: { balance: key.balance - feeAmount },
            }),

            // Log transaction
            this.prisma.transaction.create({
                data: {
                    apiKeyId: key.id,
                    type: 'inactivity_fee',
                    amount: -feeAmount,
                    balanceBefore: key.balance,
                    balanceAfter: key.balance - feeAmount,
                    description: 'Monthly inactivity fee ($5)',
                },
            }),
        ]);

        this.logger.log(`Charged $5 inactivity fee to ${key.userEmail}. New balance: ${key.balance - feeAmount}`);
    }
}
