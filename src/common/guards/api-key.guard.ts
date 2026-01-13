import {
    Injectable,
    CanActivate,
    ExecutionContext,
    UnauthorizedException,
    ForbiddenException,
    HttpException,
    HttpStatus,
    Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createHash } from 'crypto';
import { PrismaService } from '@/prisma/prisma.service';
import { FraudDetectionService } from '@/modules/fraud/fraud-detection.service';
import { IS_PUBLIC_KEY } from '@/common/decorators/public.decorator';

@Injectable()
export class ApiKeyGuard implements CanActivate {
    private readonly logger = new Logger(ApiKeyGuard.name);

    constructor(
        private reflector: Reflector,
        private prisma: PrismaService,
        private fraudDetection: FraudDetectionService,
    ) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        // Check if endpoint is public
        const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);

        if (isPublic) {
            return true;
        }

        const request = context.switchToHttp().getRequest();
        const authHeader = request.headers.authorization;

        // Check for Authorization header
        if (!authHeader) {
            throw new UnauthorizedException({
                statusCode: 401,
                error: 'MISSING_API_KEY',
                message: 'Authorization header required',
                details: 'Include header: Authorization: Bearer YOUR_API_KEY',
            });
        }

        // Extract API key
        if (!authHeader.startsWith('Bearer ')) {
            throw new UnauthorizedException({
                statusCode: 401,
                error: 'INVALID_AUTH_FORMAT',
                message: 'Invalid authorization format',
                details: 'Use: Authorization: Bearer YOUR_API_KEY',
            });
        }

        const apiKey = authHeader.substring(7).trim();

        // Validate key format
        if (!apiKey.startsWith('sk_mumin_') || apiKey.length !== 41) {
            throw new UnauthorizedException({
                statusCode: 401,
                error: 'INVALID_API_KEY_FORMAT',
                message: 'Invalid API key format',
            });
        }

        // Hash the key
        const keyHash = createHash('sha256').update(apiKey).digest('hex');

        try {
            const dbKey = await this.prisma.apiKey.findUnique({
                where: { keyHash },
            });

            if (!dbKey) {
                this.logger.warn(`Invalid API key attempt: ${apiKey.substring(0, 15)}...`);
                throw new UnauthorizedException({
                    statusCode: 401,
                    error: 'INVALID_API_KEY',
                    message: 'API key not found or has been revoked',
                });
            }

            // Check if active
            if (!dbKey.isActive) {
                throw new ForbiddenException({
                    statusCode: 403,
                    error: 'KEY_REVOKED',
                    message: 'This API key has been revoked',
                    revokedAt: dbKey.suspendedAt,
                });
            }

            // Check if suspended
            if (dbKey.suspendedAt) {
                throw new ForbiddenException({
                    statusCode: 403,
                    error: 'ACCOUNT_SUSPENDED',
                    message: 'Your account has been suspended',
                    reason: dbKey.suspendReason,
                    suspendedAt: dbKey.suspendedAt,
                });
            }

            // Check balance
            if (dbKey.balance <= 0) {
                throw new HttpException(
                    {
                        statusCode: 402,
                        error: 'BALANCE_DEPLETED',
                        message: 'Your API key balance is depleted. Please top up to continue.',
                        balance: 0,
                    },
                    HttpStatus.PAYMENT_REQUIRED,
                );
            }

            // Check graduated access limits (fraud prevention)
            const accountAgeDays = Math.floor(
                (Date.now() - dbKey.createdAt.getTime()) / (1000 * 60 * 60 * 24),
            );

            // Get daily request count
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const dailyRequests = await this.prisma.requestLog.count({
                where: {
                    apiKeyId: dbKey.id,
                    timestamp: { gte: today },
                },
            });

            if (dailyRequests >= dbKey.maxDailyRequests) {
                throw new HttpException(
                    {
                        statusCode: 429,
                        error: 'DAILY_LIMIT_EXCEEDED',
                        message: 'Daily request limit exceeded',
                        limit: dbKey.maxDailyRequests,
                        used: dailyRequests,
                        resetsAt: new Date(today.getTime() + 24 * 60 * 60 * 1000),
                    },
                    HttpStatus.TOO_MANY_REQUESTS,
                );
            }

            // Fraud detection checks
            const fraudCheckResult = await this.fraudDetection.checkRequest({
                apiKeyId: dbKey.id,
                ipAddress: request.ip,
                userAgent: request.headers['user-agent'],
                endpoint: request.url,
            });

            if (fraudCheckResult.isSuspicious) {
                this.logger.warn(
                    `Suspicious activity detected for key ${dbKey.keyPrefix}: ${fraudCheckResult.reason}`,
                );

                // Log fraud event
                let actionTaken = 'flagged';

                // CRITICAL severity = auto-suspend
                if (fraudCheckResult.shouldAutoSuspend) {
                    await this.prisma.apiKey.update({
                        where: { id: dbKey.id },
                        data: {
                            suspendedAt: new Date(),
                            suspendReason: `Automatic suspension: ${fraudCheckResult.reason}`,
                            isActive: false,
                        },
                    });

                    actionTaken = 'auto_suspended';

                    this.logger.error(
                        `CRITICAL fraud detected - Account auto-suspended: ${dbKey.keyPrefix}`,
                    );

                    // Log fraud event
                    await this.fraudDetection.logFraudEvent(
                        dbKey.id,
                        fraudCheckResult,
                        request.ip,
                        actionTaken,
                    );

                    throw new ForbiddenException({
                        statusCode: 403,
                        error: 'ACCOUNT_SUSPENDED_FRAUD',
                        message: 'Account suspended due to suspicious activity',
                        reason: fraudCheckResult.reason,
                        severity: fraudCheckResult.severity || 'unknown',
                    });
                } else {
                    // MEDIUM/HIGH severity = flag only, send admin notification
                    actionTaken = 'flagged_for_review';

                    // Log fraud event
                    await this.fraudDetection.logFraudEvent(
                        dbKey.id,
                        fraudCheckResult,
                        request.ip,
                        actionTaken,
                    );

                    // Update trust score
                    await this.fraudDetection.updateTrustScore(dbKey.id, fraudCheckResult.type);

                    // Add fraud flag to account
                    const updatedFlags = [...new Set([...dbKey.fraudFlags, fraudCheckResult.type || 'unknown'])];
                    await this.prisma.apiKey.update({
                        where: { id: dbKey.id },
                        data: { fraudFlags: updatedFlags },
                    });

                    this.logger.warn(
                        `${fraudCheckResult.severity.toUpperCase()} fraud detected - Flagged for review: ${dbKey.keyPrefix}`,
                    );

                    // Allow request to continue but log the event
                }
            }

            // IP whitelist check (if configured)
            if (dbKey.allowedIPs.length > 0) {
                if (!dbKey.allowedIPs.includes(request.ip)) {
                    this.logger.warn(`IP not whitelisted for key ${dbKey.keyPrefix}: ${request.ip}`);
                    throw new ForbiddenException({
                        statusCode: 403,
                        error: 'IP_NOT_WHITELISTED',
                        message: 'Your IP address is not whitelisted',
                        yourIp: request.ip,
                    });
                }
            }

            // Update key stats (balance, requests, last used)
            await this.prisma.apiKey.update({
                where: { id: dbKey.id },
                data: {
                    balance: dbKey.balance - 1,
                    totalRequests: dbKey.totalRequests + 1,
                    lastUsedAt: new Date(),
                    lastActivityDate: new Date(),
                },
            });

            // Attach user info to request
            request.user = {
                apiKeyId: dbKey.id,
                email: dbKey.userEmail,
                balance: dbKey.balance - 1,
                trustScore: dbKey.trustScore,
                accountAgeDays,
            };

            // Attach device fingerprint (from middleware)
            request.deviceFingerprint = request['deviceFingerprint'];

            return true;
        } catch (error) {
            if (error instanceof HttpException) {
                throw error;
            }

            this.logger.error('Authentication error:', error);
            throw new UnauthorizedException({
                statusCode: 401,
                error: 'AUTHENTICATION_FAILED',
                message: 'Failed to authenticate API key',
            });
        }
    }
}
