import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { Cron, CronExpression } from '@nestjs/schedule';
import { addDays } from 'date-fns';
import { randomBytes } from 'crypto';
import { Prisma } from '@prisma/client';

@Injectable()
export class DataDeletionService {
    private readonly logger = new Logger(DataDeletionService.name);

    constructor(private prisma: PrismaService) { }

    /**
     * Request account deletion (GDPR Right to be Forgotten)
     */
    async requestDeletion(apiKeyId: number, reason?: string): Promise<any> {
        const confirmationToken = randomBytes(32).toString('hex');

        const deletionRequest = await this.prisma.accountDeletionRequest.create({
            data: {
                apiKeyId,
                scheduledFor: addDays(new Date(), 30), // 30-day grace period
                confirmationToken,
                reason,
            },
        });

        return {
            requestId: deletionRequest.id,
            scheduledFor: deletionRequest.scheduledFor,
            confirmationToken,
            message:
                'Account deletion scheduled. You have 30 days to cancel. Please check your email to confirm.',
        };
    }

    /**
     * Confirm account deletion
     */
    async confirmDeletion(token: string): Promise<any> {
        const deletionRequest = await this.prisma.accountDeletionRequest.findUnique({
            where: { confirmationToken: token },
        });

        if (!deletionRequest) {
            throw new BadRequestException('Invalid confirmation token');
        }

        if (deletionRequest.confirmed) {
            throw new BadRequestException('Deletion already confirmed');
        }

        await this.prisma.accountDeletionRequest.update({
            where: { id: deletionRequest.id },
            data: {
                confirmed: true,
                confirmedAt: new Date(),
            },
        });

        return {
            message: 'Deletion confirmed. Your account will be deleted on the scheduled date.',
            scheduledFor: deletionRequest.scheduledFor,
        };
    }

    /**
     * Cancel deletion request
     */
    async cancelDeletion(apiKeyId: number): Promise<any> {
        await this.prisma.accountDeletionRequest.deleteMany({
            where: {
                apiKeyId,
                deletedAt: null,
            },
        });

        return {
            message: 'Deletion request cancelled. Your account remains active.',
        };
    }

    /**
     * Execute scheduled deletions (cron job - daily)
     */
    @Cron(CronExpression.EVERY_DAY_AT_4AM)
    async executeScheduledDeletions(): Promise<void> {
        const now = new Date();

        const pendingDeletions = await this.prisma.accountDeletionRequest.findMany({
            where: {
                scheduledFor: { lte: now },
                confirmed: true,
                deletedAt: null,
            },
        });

        this.logger.log(`Found ${pendingDeletions.length} accounts to delete`);

        for (const deletion of pendingDeletions) {
            try {
                await this.deleteAccount(deletion.apiKeyId);

                await this.prisma.accountDeletionRequest.update({
                    where: { id: deletion.id },
                    data: { deletedAt: new Date() },
                });

                this.logger.log(`Deleted account ${deletion.apiKeyId}`);
            } catch (error) {
                this.logger.error(`Failed to delete account ${deletion.apiKeyId}:`, error);
            }
        }
    }

    private async deleteAccount(apiKeyId: number): Promise<void> {
        // GDPR-compliant deletion: Remove PII, keep anonymized stats

        await this.prisma.$transaction([
            // Anonymize request logs (keep for analytics, remove PII)
            this.prisma.requestLog.updateMany({
                where: { apiKeyId },
                data: {
                    ipAddress: null,
                    userAgent: null,
                    deviceFingerprint: null,
                    geoLocation: null,
                    requestHeaders: Prisma.JsonNull,
                    requestBody: Prisma.JsonNull,
                    responseBody: Prisma.JsonNull,
                },
            }),

            // Delete email logs
            this.prisma.emailLog.deleteMany({ where: { apiKeyId } }),

            // Delete fraud events
            this.prisma.fraudEvent.deleteMany({ where: { apiKeyId } }),

            // Delete transactions (or anonymize)
            this.prisma.transaction.deleteMany({ where: { apiKeyId } }),

            // Keep payments for 7 years (legal requirement) - just anonymize
            this.prisma.payment.updateMany({
                where: { apiKeyId },
                data: {
                    ipAddress: null,
                    deviceFingerprint: null,
                },
            }),

            // Delete data export requests
            this.prisma.dataExportRequest.deleteMany({ where: { apiKeyId } }),

            // Finally, anonymize API key
            this.prisma.apiKey.update({
                where: { id: apiKeyId },
                data: {
                    keyHash: `DELETED_${Date.now()}`,
                    userEmail: null,
                    userMetadata: Prisma.JsonNull,
                    ipAtRegistration: null,
                    userAgentAtRegistration: null,
                    deviceFingerprintAtReg: null,
                    geoLocationAtReg: null,
                    isActive: false,
                    suspendedAt: new Date(),
                    suspendReason: 'Account deleted by user request (GDPR)',
                    notes: 'GDPR deletion - all PII removed',
                },
            }),
        ]);
    }
}
