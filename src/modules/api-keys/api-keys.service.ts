import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { RegisterApiKeyDto } from './dto/register-key.dto';
import { generateApiKey, hashApiKey, getKeyPrefix } from '@/common/utils/crypto.util';
import { EmailService } from '@/modules/email/email.service';
import { BillingService } from '@/modules/billing/billing.service';

@Injectable()
export class ApiKeysService {
    private readonly logger = new Logger(ApiKeysService.name);

    constructor(
        private prisma: PrismaService,
        private emailService: EmailService,
        private billingService: BillingService,
    ) { }

    /**
     * Register a new API key with legal compliance tracking
     */
    async register(dto: RegisterApiKeyDto, ipAddress: string, userAgent: string, deviceFingerprint: string, geoLocation: string) {
        // Validate ToS acceptance
        if (!dto.acceptTerms) {
            throw new BadRequestException({
                statusCode: 400,
                error: 'TERMS_NOT_ACCEPTED',
                message: 'You must accept the Terms of Service to register',
            });
        }

        if (!dto.acceptPrivacyPolicy) {
            throw new BadRequestException({
                statusCode: 400,
                error: 'PRIVACY_POLICY_NOT_ACCEPTED',
                message: 'You must accept the Privacy Policy to register',
            });
        }

        // Generate API key
        this.logger.log(`Registering new API key for email: ${dto.email}`);
        const apiKey = generateApiKey();
        const keyHash = hashApiKey(apiKey);
        const keyPrefix = getKeyPrefix(apiKey);

        // Find user
        const user = await this.prisma.user.findUnique({
            where: { email: dto.email }
        });
        if (!user) throw new BadRequestException('User account missing. Please register first.');

        // Limit to 5 keys
        const keyCount = await this.prisma.apiKey.count({ where: { userId: user.id } });
        if (keyCount >= 5) {
            throw new BadRequestException('Maximum limit of 5 API keys reached. Please delete or rotate existing keys.');
        }

        // Create API key in database
        const dbKey = await this.prisma.apiKey.create({
            data: {
                keyHash,
                keyPrefix,
                userId: user.id,
                userEmail: dto.email,
                userMetadata: dto.metadata,
                termsAcceptedAt: new Date(),
                termsVersion: dto.termsVersion,
                privacyPolicyAcceptedAt: new Date(),
                privacyPolicyVersion: dto.privacyPolicyVersion,
                ipAtRegistration: ipAddress,
                userAgentAtRegistration: userAgent,
                deviceFingerprintAtReg: deviceFingerprint,
                geoLocationAtReg: geoLocation,
            },
        });

        // NO individual transaction - we use user balance

        this.logger.log(`New API key registered: ${keyPrefix} (${dto.email})`);

        // Send welcome email
        if (dto.email) {
            this.emailService.sendWelcomeEmail({
                id: dbKey.id,
                userId: user.id,
                keyPrefix,
                balance: user.balance,
                userEmail: dto.email,
            }).catch((error) => {
                this.logger.error(`Failed to send welcome email to ${dto.email}:`, error);
            });
        }

        return {
            apiKey, // Only time we return the plain key
            keyPrefix,
            balance: user.balance,
            email: dto.email,
            createdAt: dbKey.createdAt,
            message: 'API key created successfully. Save this key securely - it will not be shown again.',
        };
    }

    /**
     * Get API key info
     */
    async getKeyInfo(apiKeyId: number) {
        const key = await this.prisma.apiKey.findUnique({
            where: { id: apiKeyId },
            select: {
                id: true,
                keyPrefix: true,
                userEmail: true,
                user: {
                    select: {
                        balance: true,
                        totalRequests: true,
                        totalDataTransferred: true,
                    }
                },
                isActive: true,
                suspendedAt: true,
                suspendReason: true,
                createdAt: true,
                lastUsedAt: true,
                lastActivityDate: true,
                termsVersion: true,
                privacyPolicyVersion: true,
                trustScore: true,
                fraudFlags: true,
                maxDailyRequests: true,
                inactivityWarnings: true,
                dormantAt: true,
            },
        });

        if (!key) {
            throw new BadRequestException('API key not found');
        }

        // Convert BigInt and flatten user data
        return {
            ...key,
            id: key.id.toString(),
            balance: key.user?.balance ?? 0,
            totalRequests: Number(key.user?.totalRequests ?? 0),
            totalDataTransferred: Number(key.user?.totalDataTransferred ?? 0n),
            user: undefined, // Don't return nested user object
        };
    }

    async getKeysByUserEmail(email: string) {
        const keys = await this.prisma.apiKey.findMany({
            where: { userEmail: email },
            orderBy: { createdAt: 'desc' },
            include: { user: true },
        });

        return keys.map((key) => ({
            id: key.id.toString(),
            keyPrefix: key.keyPrefix,
            createdAt: key.createdAt,
            lastUsedAt: key.lastUsedAt,
            isActive: key.isActive,
            balance: key.user?.balance ?? 0,
            totalRequests: Number(key.user?.totalRequests ?? 0),
            totalDataTransferred: Number(key.user?.totalDataTransferred ?? 0n),
        }));
    }

    /**
     * Rotate API key (generate new key, invalidate old one)
     */
    async rotateKey(apiKeyId: number) {
        const oldKey = await this.prisma.apiKey.findUnique({
            where: { id: apiKeyId },
        });

        if (!oldKey) {
            throw new BadRequestException('API key not found');
        }

        // Generate new key
        const newApiKey = generateApiKey();
        const newKeyHash = hashApiKey(newApiKey);
        const newKeyPrefix = getKeyPrefix(newApiKey);

        // Update database
        await this.prisma.apiKey.update({
            where: { id: apiKeyId },
            data: {
                keyHash: newKeyHash,
                keyPrefix: newKeyPrefix,
            },
        });

        this.logger.log(`API key rotated: ${oldKey.keyPrefix} → ${newKeyPrefix}`);

        return {
            apiKey: newApiKey,
            keyPrefix: newKeyPrefix,
            message: 'API key rotated successfully. Update your applications with the new key.',
        };
    }

    async rotateKeyByUserEmail(email: string) {
        const key = await this.prisma.apiKey.findFirst({
            where: { userEmail: email },
            orderBy: { createdAt: 'desc' },
        });

        if (!key) {
            throw new BadRequestException('API key not found');
        }

        return this.rotateKey(key.id);
    }

    /**
     * Update API key settings
     */
    async updateSettings(apiKeyId: number, settings: { allowedIPs?: string[]; webhookUrl?: string }) {
        await this.prisma.apiKey.update({
            where: { id: apiKeyId },
            data: settings,
        });

        this.logger.log(`Settings updated for API key ID ${apiKeyId}`);

        return { message: 'Settings updated successfully' };
    }

    async updateSettingsByUserEmail(email: string, settings: { allowedIPs?: string[]; webhookUrl?: string }) {
        const key = await this.prisma.apiKey.findFirst({
            where: { userEmail: email },
            orderBy: { createdAt: 'desc' },
        });

        if (!key) {
            throw new BadRequestException('API key not found');
        }

        return this.updateSettings(key.id, settings);
    }

    /**
     * Internal sync: Find API key prefix for a telegram ID
     */
    async syncTelegramStatus(telegramId: string) {
        const user = await this.prisma.user.findFirst({
            where: { telegramId },
            include: {
                apiKeys: {
                    where: { isActive: true },
                    orderBy: { createdAt: 'desc' },
                    take: 1,
                }
            }
        });

        if (!user) return null;

        const stats = await this.billingService.getUsageStats(user.id);
        const transactions = await this.billingService.getTransactions(user.id, 1, 5);
        const payments = await this.billingService.getPayments(user.id);

        return {
            userId: user.id,
            email: user.email,
            apiKeyId: user.apiKeys[0]?.id || null,
            apiKeyPrefix: user.apiKeys[0]?.keyPrefix || null,
            balance: user.balance,
            dailyRequests: stats.dailyRequests,
            monthlyRequests: stats.monthlyRequests,
            transactions: transactions.data,
            payments: payments.slice(0, 5),
            linked: true,
        };
    }
}
