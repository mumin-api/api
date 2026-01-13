import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { RegisterApiKeyDto } from './dto/register-key.dto';
import { generateApiKey, hashApiKey, getKeyPrefix } from '@/common/utils/crypto.util';
import { EmailService } from '@/modules/email/email.service';

@Injectable()
export class ApiKeysService {
    private readonly logger = new Logger(ApiKeysService.name);

    constructor(
        private prisma: PrismaService,
        private emailService: EmailService,
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
        const apiKey = generateApiKey();
        const keyHash = hashApiKey(apiKey);
        const keyPrefix = getKeyPrefix(apiKey);

        // Create API key in database
        const dbKey = await this.prisma.apiKey.create({
            data: {
                keyHash,
                keyPrefix,
                userEmail: dto.email,
                userMetadata: dto.metadata,
                balance: 100, // Free 100 credits on signup
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

        // Create initial transaction for free credits
        await this.prisma.transaction.create({
            data: {
                apiKeyId: dbKey.id,
                type: 'bonus',
                amount: 100,
                balanceBefore: 0,
                balanceAfter: 100,
                description: 'Welcome bonus - 100 free credits',
            },
        });

        this.logger.log(`New API key registered: ${keyPrefix} (${dto.email})`);

        // Send welcome email
        if (dto.email) {
            this.emailService.sendWelcomeEmail({
                id: dbKey.id,
                keyPrefix,
                balance: 100,
                userEmail: dto.email,
            }).catch((error) => {
                this.logger.error(`Failed to send welcome email to ${dto.email}:`, error);
            });
        }

        return {
            apiKey, // Only time we return the plain key
            keyPrefix,
            balance: 100,
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
                balance: true,
                totalRequests: true,
                totalDataTransferred: true,
                userEmail: true,
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

        return key;
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
}
