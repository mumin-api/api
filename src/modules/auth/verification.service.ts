import { Injectable, Logger, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

@Injectable()
export class VerificationService {
    private readonly logger = new Logger(VerificationService.name);
    private readonly CODE_EXPIRY_MINUTES = 15;
    private readonly MAX_RESENDS_PER_HOUR = 3;
    private readonly MAX_FAILED_ATTEMPTS_PER_IP_PER_HOUR = 10;

    constructor(private prisma: PrismaService) { }

    /**
     * Generate a random 6-digit verification code
     */
    private generateCode(): string {
        return crypto.randomInt(100000, 999999).toString();
    }

    /**
     * Hash the verification code using bcrypt
     */
    private async hashCode(code: string): Promise<string> {
        return bcrypt.hash(code, 10);
    }

    /**
     * Constant-time comparison to prevent timing attacks
     */
    private async verifyCodeHash(plainCode: string, hashedCode: string): Promise<boolean> {
        try {
            return await bcrypt.compare(plainCode, hashedCode);
        } catch (error) {
            this.logger.error('Code verification error:', error);
            return false;
        }
    }

    /**
     * Create and send a new verification code
     */
    async sendVerificationCode(email: string, ipAddress?: string, userAgent?: string): Promise<{ code: string }> {
        // Check rate limiting for resends
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        const recentResends = await this.prisma.verificationLog.count({
            where: {
                email,
                action: { in: ['sent', 'resent'] },
                createdAt: { gte: oneHourAgo },
            },
        });

        if (recentResends >= this.MAX_RESENDS_PER_HOUR) {
            await this.logVerification(email, 'blocked', false, 'Rate limit exceeded', ipAddress, userAgent);
            throw new BadRequestException({
                statusCode: 429,
                error: 'RATE_LIMIT_EXCEEDED',
                message: `Too many verification codes requested. Please try again in an hour.`,
            });
        }

        // Invalidate all old codes for this email
        await this.prisma.verificationCode.deleteMany({
            where: { email },
        });

        // Generate new code
        const plainCode = this.generateCode();
        const hashedCode = await this.hashCode(plainCode);
        const expiresAt = new Date(Date.now() + this.CODE_EXPIRY_MINUTES * 60 * 1000);

        // Find user by email
        const user = await this.prisma.user.findUnique({
            where: { email },
            select: { id: true },
        });

        // Store hashed code
        await this.prisma.verificationCode.create({
            data: {
                email,
                code: hashedCode,
                expiresAt,
                userId: user?.id,
            },
        });

        // Log the action
        await this.logVerification(email, recentResends > 0 ? 'resent' : 'sent', true, null, ipAddress, userAgent, user?.id);

        this.logger.log(`Verification code ${recentResends > 0 ? 'resent' : 'sent'} to ${email}`);

        // Return plain code (to be sent via email)
        return { code: plainCode };
    }

    /**
     * Verify a code and mark user as verified
     */
    async verifyCode(email: string, plainCode: string, ipAddress?: string, userAgent?: string): Promise<void> {
        // Check IP-based rate limiting for failed attempts
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        const failedAttempts = await this.prisma.verificationLog.count({
            where: {
                ipAddress,
                action: 'failed',
                createdAt: { gte: oneHourAgo },
            },
        });

        if (failedAttempts >= this.MAX_FAILED_ATTEMPTS_PER_IP_PER_HOUR) {
            await this.logVerification(email, 'blocked', false, 'IP rate limit exceeded', ipAddress, userAgent);
            throw new BadRequestException({
                statusCode: 429,
                error: 'TOO_MANY_ATTEMPTS',
                message: 'Too many failed attempts. Please try again later.',
            });
        }

        // Find the most recent valid code
        const verificationCode = await this.prisma.verificationCode.findFirst({
            where: {
                email,
                expiresAt: { gt: new Date() },
            },
            orderBy: { createdAt: 'desc' },
        });

        if (!verificationCode) {
            await this.logVerification(email, 'failed', false, 'Code not found or expired', ipAddress, userAgent);
            throw new BadRequestException({
                statusCode: 400,
                error: 'CODE_EXPIRED',
                message: 'Verification code has expired. Please request a new one.',
            });
        }

        // Check if code was already used
        if (verificationCode.usedAt) {
            await this.logVerification(email, 'failed', false, 'Code already used', ipAddress, userAgent);
            throw new BadRequestException({
                statusCode: 400,
                error: 'CODE_ALREADY_USED',
                message: 'This verification code has already been used.',
            });
        }

        // Check if max attempts exceeded
        if (verificationCode.attempts >= verificationCode.maxAttempts) {
            await this.logVerification(email, 'blocked', false, 'Max attempts exceeded', ipAddress, userAgent);
            throw new BadRequestException({
                statusCode: 400,
                error: 'MAX_ATTEMPTS_EXCEEDED',
                message: 'Too many incorrect attempts. Please request a new code.',
            });
        }

        // Verify code using constant-time comparison
        const isValid = await this.verifyCodeHash(plainCode, verificationCode.code);

        if (!isValid) {
            // Increment attempts
            await this.prisma.verificationCode.update({
                where: { id: verificationCode.id },
                data: { attempts: { increment: 1 } },
            });

            const remainingAttempts = verificationCode.maxAttempts - verificationCode.attempts - 1;
            await this.logVerification(email, 'failed', false, 'Invalid code', ipAddress, userAgent);

            throw new BadRequestException({
                statusCode: 400,
                error: 'INVALID_CODE',
                message: `Invalid verification code. ${remainingAttempts} attempt(s) remaining.`,
                remainingAttempts,
            });
        }

        // Code is valid - mark as used
        await this.prisma.verificationCode.update({
            where: { id: verificationCode.id },
            data: { usedAt: new Date() },
        });

        // Mark user as verified
        const user = await this.prisma.user.update({
            where: { email },
            data: {
                emailVerified: true,
                emailVerifiedAt: new Date(),
            },
        });

        // Log successful verification
        await this.logVerification(email, 'verified', true, null, ipAddress, userAgent, user.id);

        this.logger.log(`Email verified successfully for ${email}`);
    }

    /**
     * Get verification status for an email
     */
    async getVerificationStatus(email: string): Promise<{ verified: boolean; codeExpired: boolean }> {
        const user = await this.prisma.user.findUnique({
            where: { email },
            select: { emailVerified: true },
        });

        if (!user) {
            return { verified: false, codeExpired: true };
        }

        if (user.emailVerified) {
            return { verified: true, codeExpired: false };
        }

        // Check if there's a valid code
        const validCode = await this.prisma.verificationCode.findFirst({
            where: {
                email,
                expiresAt: { gt: new Date() },
                usedAt: null,
            },
        });

        return {
            verified: false,
            codeExpired: !validCode,
        };
    }

    /**
     * Cleanup expired verification codes (cron job)
     */
    async cleanupExpiredCodes(): Promise<number> {
        const result = await this.prisma.verificationCode.deleteMany({
            where: {
                expiresAt: { lt: new Date() },
            },
        });

        this.logger.log(`Cleaned up ${result.count} expired verification codes`);
        return result.count;
    }

    /**
     * Log verification events for security monitoring
     */
    private async logVerification(
        email: string,
        action: string,
        success: boolean,
        reason: string | null,
        ipAddress?: string,
        userAgent?: string,
        userId?: number,
    ): Promise<void> {
        try {
            await this.prisma.verificationLog.create({
                data: {
                    email,
                    action,
                    success,
                    reason,
                    ipAddress,
                    userAgent,
                    userId,
                },
            });
        } catch (error) {
            this.logger.error('Failed to log verification event:', error);
        }
    }
}
