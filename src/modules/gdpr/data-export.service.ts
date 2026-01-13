import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { addDays } from 'date-fns';
import * as fs from 'fs/promises';
import * as path from 'path';

@Injectable()
export class DataExportService {
    private readonly logger = new Logger(DataExportService.name);

    constructor(private prisma: PrismaService) { }

    /**
     * Request data export (GDPR Right to Data Portability)
     */
    async requestExport(apiKeyId: number, format: 'json' | 'csv' = 'json'): Promise<any> {
        // Create export request
        const exportRequest = await this.prisma.dataExportRequest.create({
            data: {
                apiKeyId,
                format,
                status: 'pending',
            },
        });

        // Process export asynchronously
        this.processExport(exportRequest.id).catch((error) => {
            this.logger.error(`Export processing failed for request ${exportRequest.id}:`, error);
        });

        return {
            requestId: exportRequest.id,
            status: 'pending',
            message: 'Your data export is being prepared. You will receive an email when ready.',
        };
    }

    private async processExport(requestId: number): Promise<void> {
        try {
            const exportRequest = await this.prisma.dataExportRequest.findUnique({
                where: { id: requestId },
            });

            if (!exportRequest) {
                throw new Error('Export request not found');
            }

            // Update status to processing
            await this.prisma.dataExportRequest.update({
                where: { id: requestId },
                data: { status: 'processing' },
            });

            // Gather all user data
            const userData = await this.gatherUserData(exportRequest.apiKeyId);

            // Generate export file
            const filename = `user_data_${exportRequest.apiKeyId}_${Date.now()}.${exportRequest.format}`;
            const filepath = path.join(process.cwd(), 'temp', filename);

            // Ensure temp directory exists
            await fs.mkdir(path.join(process.cwd(), 'temp'), { recursive: true });

            if (exportRequest.format === 'json') {
                await fs.writeFile(filepath, JSON.stringify(userData, null, 2));
            } else {
                // Convert to CSV (simplified)
                const csv = this.convertToCSV(userData);
                await fs.writeFile(filepath, csv);
            }

            const stats = await fs.stat(filepath);

            // In production: Upload to storage (S3, etc.) and get URL
            const downloadUrl = `/exports/${filename}`;

            // Update export request
            await this.prisma.dataExportRequest.update({
                where: { id: requestId },
                data: {
                    status: 'completed',
                    completedAt: new Date(),
                    downloadUrl,
                    expiresAt: addDays(new Date(), 7), // Expires in 7 days
                    fileSize: stats.size,
                },
            });

            this.logger.log(`Export completed for request ${requestId}`);
        } catch (error) {
            this.logger.error(`Export failed for request ${requestId}:`, error);

            await this.prisma.dataExportRequest.update({
                where: { id: requestId },
                data: { status: 'failed' },
            });
        }
    }

    private async gatherUserData(apiKeyId: number): Promise<any> {
        const [apiKey, requestLogs, transactions, payments, emailLogs, fraudEvents] =
            await Promise.all([
                this.prisma.apiKey.findUnique({ where: { id: apiKeyId } }),
                this.prisma.requestLog.findMany({
                    where: { apiKeyId },
                    orderBy: { timestamp: 'desc' },
                    take: 10000, // Limit to last 10k requests
                }),
                this.prisma.transaction.findMany({
                    where: { apiKeyId },
                    orderBy: { createdAt: 'desc' },
                }),
                this.prisma.payment.findMany({
                    where: { apiKeyId },
                    orderBy: { createdAt: 'desc' },
                }),
                this.prisma.emailLog.findMany({
                    where: { apiKeyId },
                    orderBy: { sentAt: 'desc' },
                }),
                this.prisma.fraudEvent.findMany({
                    where: { apiKeyId },
                    orderBy: { timestamp: 'desc' },
                }),
            ]);

        return {
            exportDate: new Date().toISOString(),
            apiKey: {
                id: apiKey?.id,
                keyPrefix: apiKey?.keyPrefix,
                email: apiKey?.userEmail,
                balance: apiKey?.balance,
                totalRequests: apiKey?.totalRequests,
                createdAt: apiKey?.createdAt,
                lastUsedAt: apiKey?.lastUsedAt,
                termsAcceptedAt: apiKey?.termsAcceptedAt,
                termsVersion: apiKey?.termsVersion,
            },
            requestLogs: requestLogs.map((log) => ({
                timestamp: log.timestamp,
                endpoint: log.endpoint,
                method: log.method,
                status: log.responseStatus,
                ipAddress: log.ipAddress,
            })),
            transactions: transactions.map((tx) => ({
                date: tx.createdAt,
                type: tx.type,
                amount: tx.amount,
                description: tx.description,
            })),
            payments: payments.map((payment) => ({
                date: payment.createdAt,
                provider: payment.provider,
                amount: payment.amount.toString(),
                currency: payment.currency,
                status: payment.status,
            })),
            emailLogs: emailLogs.map((email) => ({
                sentAt: email.sentAt,
                emailType: email.emailType,
                subject: email.subject,
                deliveredAt: email.deliveredAt,
                openedAt: email.openedAt,
            })),
            fraudEvents: fraudEvents.map((event) => ({
                timestamp: event.timestamp,
                type: event.eventType,
                severity: event.severity,
                description: event.description,
            })),
        };
    }

    private convertToCSV(data: any): string {
        // Simplified CSV conversion
        return JSON.stringify(data);
    }
}
