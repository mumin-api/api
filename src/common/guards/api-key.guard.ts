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
import { EmailService } from '@/modules/email/email.service';

@Injectable()
export class ApiKeyGuard implements CanActivate {
    private readonly logger = new Logger(ApiKeyGuard.name);

    constructor(
        private reflector: Reflector,
        private prisma: PrismaService,
        private fraudDetection: FraudDetectionService,
        private emailService: EmailService,
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
        const isFreeMode = process.env.FREE_MODE === 'true';

        // Allow OPTIONS (preflight) requests
        if (request.method === 'OPTIONS') {
            return true;
        }

        const authHeader = request.headers.authorization;
        const xApiKey = request.headers['x-api-key'];

        this.logger.log(`Auth Debug: AuthHeader=${authHeader ? 'YES' : 'NO'}, X-API-Key=${xApiKey ? 'YES' : 'NO'}`);
        if (xApiKey) this.logger.log(`Received X-API-Key: ${xApiKey}`);

        let apiKey: string;

        if (authHeader && authHeader.startsWith('Bearer ')) {
            apiKey = authHeader.substring(7).trim();
        } else if (xApiKey) {
            apiKey = (Array.isArray(xApiKey) ? xApiKey[0] : xApiKey).trim();
        } else {
            this.logger.warn('Missing both Authorization and X-API-Key headers');
            throw new UnauthorizedException({
                statusCode: 401,
                error: 'MISSING_API_KEY',
                message: 'API Key required',
                details: 'Use header: "Authorization: Bearer <KEY>" or "X-API-Key: <KEY>"',
            });
        }

        // Validate key format
        // Allow 41 chars (production) or 42 chars (dev test key)
        if (!apiKey.startsWith('sk_mumin_') || (apiKey.length !== 41 && apiKey.length !== 42)) {
            this.logger.error(`Invalid API key format: received length ${apiKey.length}, starts with ${apiKey.substring(0, 9)}`);
            throw new UnauthorizedException({
                statusCode: 401,
                error: 'INVALID_API_KEY_FORMAT',
                message: 'Invalid API key format',
                details: `Expected length 41 or 42, got ${apiKey.length}`,
            });
        }

        // Hash the key
        const keyHash = createHash('sha256').update(apiKey).digest('hex');

        try {
            const dbKey = await this.prisma.apiKey.findUnique({
                where: { keyHash },
                include: { user: true },
            });

            if (!dbKey) {
                this.logger.warn(`Invalid API key attempt: ${apiKey.substring(0, 15)}...`);
                throw new UnauthorizedException({
                    statusCode: 401,
                    error: 'INVALID_API_KEY',
                    message: 'API key not found or has been revoked',
                });
            }

            const user = dbKey.user;
            if (!user) {
                throw new UnauthorizedException({
                    statusCode: 401,
                    error: 'USER_NOT_FOUND',
                    message: 'Associated user account not found',
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

            // Check if account suspended (User-level or Key-level)
            if (dbKey.suspendedAt) {
                throw new ForbiddenException({
                    statusCode: 403,
                    error: 'ACCOUNT_SUSPENDED',
                    message: 'Your account has been suspended',
                    reason: dbKey.suspendReason,
                    suspendedAt: dbKey.suspendedAt,
                });
            }

            if (!isFreeMode && user.balance <= 0) {
                throw new HttpException(
                    {
                        statusCode: 402,
                        error: 'BALANCE_DEPLETED',
                        message: 'Your shared account balance is depleted. Please top up to continue.',
                        balance: 0,
                    },
                    HttpStatus.PAYMENT_REQUIRED,
                );
            }

            // Trigger low balance alert if needed
            if (!isFreeMode && user.balance < 50 && user.lowBalanceAlerts && !user.lowBalanceAlertSent) {
                try {
                    // Import EmailService if not available or use this.prisma (but easier to call EmailService)
                    // Since we want to be safe and not over-engineer, we'll use a direct service if possible.
                    // Actually, let's just log and update DB for now, or check if we can inject EmailService.
                    // ApiKeyGuard has access to prisma.
                    
                    // We'll update the user and trigger email in a background-like way
                    await this.prisma.user.update({
                        where: { id: user.id },
                        data: { lowBalanceAlertSent: true }
                    });

                    // Send email
                    await this.emailService.sendBalanceLowWarning({
                        id: dbKey.id,
                        userId: user.id,
                        userEmail: user.email,
                        balance: user.balance,
                    });
                } catch (e) {
                    this.logger.error('Failed to trigger low balance alert', e);
                }
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
                    await this.fraudDetection.updateTrustScore(dbKey.id, fraudCheckResult.type || 'unknown');

                    // Add fraud flag to account
                    const updatedFlags = [...new Set([...dbKey.fraudFlags, fraudCheckResult.type || 'unknown'])];
                    await this.prisma.apiKey.update({
                        where: { id: dbKey.id },
                        data: { fraudFlags: updatedFlags },
                    });

                    this.logger.warn(
                        `${fraudCheckResult.severity?.toUpperCase() || 'UNKNOWN'} fraud detected - Flagged for review: ${dbKey.keyPrefix}`,
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

            // Update user balance and total requests
            await this.prisma.user.update({
                where: { id: user.id },
                data: {
                    balance: isFreeMode ? user.balance : user.balance - 1,
                    totalRequests: user.totalRequests + 1,
                },
            });

            // Update key last used (only)
            await this.prisma.apiKey.update({
                where: { id: dbKey.id },
                data: {
                    lastUsedAt: new Date(),
                    lastActivityDate: new Date(),
                },
            });

            // Attach user info to request
            request.user = {
                userId: user.id,
                apiKeyId: dbKey.id,
                email: user.email,
                balance: user.balance - 1,
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
