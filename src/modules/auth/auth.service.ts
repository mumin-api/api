import { Injectable, ForbiddenException, BadRequestException, NotFoundException, UnauthorizedException, Inject } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { RegisterDto, LoginDto, UpdateProfileDto, RequestEmailChangeDto, VerifyEmailChangeDto } from './dto/auth.dto';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { VerificationService } from './verification.service';
import { EmailService } from '../email/email.service';
import Redis from 'ioredis';

@Injectable()
export class AuthService {
    constructor(
        private prisma: PrismaService,
        private jwtService: JwtService,
        private config: ConfigService,
        private verificationService: VerificationService,
        private emailService: EmailService,
        @Inject('REDIS_CLIENT') private redis: Redis,
    ) { }

    async claimTelegram(userId: number, token: string) {
        const key = `auth:telegram:${token}`;
        const data = await this.redis.get(key);
        
        if (!data) {
            console.warn(`[AuthService] Claim failed: Token ${token} not found in Redis (key: ${key})`);
            throw new BadRequestException('Invalid or expired token');
        }

        const { telegramId, username } = JSON.parse(data);
        console.log(`[AuthService] Claiming telegramId ${telegramId} for userId ${userId}`);

        // Check if this telegram ID is already linked to ANOTHER user
        const existing = await this.prisma.user.findFirst({
            where: { telegramId },
        });

        if (existing && existing.id !== userId) {
            console.warn(`[AuthService] Claim failed: telegramId ${telegramId} already linked to user ${existing.id}`);
            throw new ForbiddenException('This Telegram account is already linked to another user.');
        }

        // Link
        await this.prisma.user.update({
            where: { id: userId },
            data: { telegramId },
        });

        // Delete token so it can't be reused
        await this.redis.del(key);
        console.log(`[AuthService] Successfully linked telegramId ${telegramId} to userId ${userId}`);

        return { success: true, telegramId, username };
    }

    async register(dto: RegisterDto) {
        const hash = await this.hashData(dto.password);
        try {
            const user = await this.prisma.user.create({
                data: {
                    email: dto.email,
                    password: hash,
                    firstName: dto.firstName,
                    lastName: dto.lastName,
                    balance: 100,
                },
            });

            // Create initial bonus transaction
            await this.prisma.transaction.create({
                data: {
                    userId: user.id,
                    type: 'bonus',
                    amount: 100,
                    balanceBefore: 0,
                    balanceAfter: 100,
                    description: 'Registration bonus - 100 free tokens',
                },
            });

            // Send verification email
            try {
                const { code } = await this.verificationService.sendVerificationCode(user.email);
                await this.emailService.sendVerificationCode(user.email, code);
            } catch (emailError) {
                // Log error but don't fail registration
                console.error('Failed to send verification email:', emailError);
            }

            const tokens = await this.getTokens(user.id, user.email);
            await this.updateRtHash(user.id, tokens.refresh_token);
            return tokens;
        } catch (error) {
            if (error instanceof PrismaClientKnownRequestError) {
                if (error.code === 'P2002') {
                    throw new ForbiddenException('Credentials taken');
                }
            }
            throw error;
        }
    }

    async login(dto: LoginDto) {
        const user = await this.prisma.user.findUnique({
            where: {
                email: dto.email,
            },
            select: {
                id: true,
                email: true,
                password: true,
                firstName: true,
                lastName: true,
                emailVerified: true,
            },
        });

        if (!user) throw new ForbiddenException('User not found');

        const passwordMatches = await bcrypt.compare(dto.password, user.password);
        if (!passwordMatches) throw new ForbiddenException('Invalid credentials');

        // Check if email is verified
        if (!user.emailVerified) {
            throw new UnauthorizedException({
                statusCode: 401,
                error: 'EMAIL_NOT_VERIFIED',
                message: 'Please verify your email before logging in. Check your inbox for the verification code.',
                email: user.email,
            });
        }

        const tokens = await this.getTokens(user.id, user.email);
        await this.updateRtHash(user.id, tokens.refresh_token);

        return {
            user: {
                id: user.id.toString(),
                email: user.email,
                displayName: `${user.firstName} ${user.lastName}`.trim(),
            },
            ...tokens,
        };
    }

    async logout(userId: number) {
        await this.prisma.user.updateMany({
            where: {
                id: userId,
                hashedRt: {
                    not: null,
                },
            },
            data: {
                hashedRt: null,
            },
        });
    }

    async refreshTokens(userId: number, rt: string) {
        const user = await this.prisma.user.findUnique({
            where: {
                id: userId,
            },
        });
        if (!user || !user.hashedRt) throw new ForbiddenException('Access Denied');

        const rtMatches = await bcrypt.compare(rt, user.hashedRt);
        if (!rtMatches) throw new ForbiddenException('Access Denied');

        const tokens = await this.getTokens(user.id, user.email);
        await this.updateRtHash(user.id, tokens.refresh_token);
        return tokens;
    }

    async getMe(userId: number) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                balance: true,
                totalRequests: true,
                totalDataTransferred: true,
                createdAt: true,
                lowBalanceAlerts: true,
                usageReports: true,
                securityAlerts: true,
            }
        });

        if (!user) throw new NotFoundException('User not found');

        return {
            id: user.id.toString(),
            email: user.email,
            displayName: `${user.firstName || ''} ${user.lastName || ''}`.trim(),
            balance: user.balance,
            totalRequests: Number(user.totalRequests),
            totalDataTransferred: Number(user.totalDataTransferred),
            lowBalanceAlerts: user.lowBalanceAlerts,
            usageReports: user.usageReports,
            securityAlerts: user.securityAlerts,
        };
    }

    async updateProfile(userId: number, dto: UpdateProfileDto) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
        });

        if (!user) throw new NotFoundException('User not found');

        // PREVENT direct email change - must use /auth/request-email-change
        if (dto.email && dto.email !== user.email) {
            throw new BadRequestException('Email cannot be changed directly. Use the email verification flow.');
        }

        // Update user
        let { firstName, lastName } = dto;
        if (dto.displayName && !firstName && !lastName) {
            const parts = dto.displayName.trim().split(/\s+/);
            firstName = parts[0];
            lastName = parts.slice(1).join(' ');
        }

        const updatedUser = await this.prisma.user.update({
            where: { id: userId },
            data: {
                // Email update is now handled via verifyEmailChange
                firstName: firstName ?? user.firstName,
                lastName: lastName ?? user.lastName,
                lowBalanceAlerts: dto.lowBalanceAlerts ?? user.lowBalanceAlerts,
                usageReports: dto.usageReports ?? user.usageReports,
                securityAlerts: dto.securityAlerts ?? user.securityAlerts,
            },
        });

        // Generate new tokens with updated data (email remains same here)
        const tokens = await this.getTokens(updatedUser.id, updatedUser.email);
        await this.updateRtHash(updatedUser.id, tokens.refresh_token);

        return {
            user: {
                id: updatedUser.id.toString(),
                email: updatedUser.email,
                displayName: `${updatedUser.firstName} ${updatedUser.lastName}`.trim(),
            },
            ...tokens,
        };
    }

    async requestEmailChange(userId: number, newEmail: string) {
        // Validate email not taken
        const existing = await this.prisma.user.findUnique({
            where: { email: newEmail },
        });
        if (existing) throw new BadRequestException('Email already taken');

        // Generate code
        const code = crypto.randomInt(100000, 999999).toString();
        const hashCode = await bcrypt.hash(code, 10);

        // Store in redis (15m)
        const key = `auth:email-change:${userId}`;
        await this.redis.set(key, JSON.stringify({ newEmail, code: hashCode }), 'EX', 15 * 60);

        // Send email
        await this.emailService.sendVerificationCode(newEmail, code);

        return { success: true, message: 'Verification code sent to your new email' };
    }

    async verifyEmailChange(userId: number, plainCode: string) {
        const key = `auth:email-change:${userId}`;
        const data = await this.redis.get(key);
        if (!data) throw new BadRequestException('No pending email change or code expired');

        const { newEmail, code: hashCode } = JSON.parse(data);

        // Verify code
        const isValid = await bcrypt.compare(plainCode, hashCode);
        if (!isValid) throw new BadRequestException('Invalid verification code');

        // Perform update
        const user = await this.prisma.user.findUnique({ where: { id: userId } });
        if (!user) throw new NotFoundException('User not found');

        const oldEmail = user.email;

        // Atomic update
        const updatedUser = await this.prisma.user.update({
            where: { id: userId },
            data: { email: newEmail },
        });

        // Update API keys linked to old email
        await this.prisma.apiKey.updateMany({
            where: { userEmail: oldEmail },
            data: { userEmail: newEmail },
        });

        // Delete from redis
        await this.redis.del(key);

        // New tokens
        const tokens = await this.getTokens(updatedUser.id, updatedUser.email);
        await this.updateRtHash(updatedUser.id, tokens.refresh_token);

        return {
            user: {
                id: updatedUser.id.toString(),
                email: updatedUser.email,
                displayName: `${updatedUser.firstName} ${updatedUser.lastName}`.trim(),
            },
            ...tokens,
        };
    }

    async updateRtHash(userId: number, rt: string) {
        const hash = await this.hashData(rt);
        await this.prisma.user.update({
            where: {
                id: userId,
            },
            data: {
                hashedRt: hash,
            },
        });
    }

    hashData(data: string) {
        return bcrypt.hash(data, 10);
    }

    async getTokens(userId: number, email: string) {
        const [at, rt] = await Promise.all([
            this.jwtService.signAsync(
                {
                    sub: userId,
                    email,
                },
                {
                    secret: this.config.get<string>('JWT_SECRET'),
                    expiresIn: '15m',
                },
            ),
            this.jwtService.signAsync(
                {
                    sub: userId,
                    email,
                },
                {
                    secret: this.config.get<string>('JWT_REFRESH_SECRET'),
                    expiresIn: '7d',
                },
            ),
        ]);

        return {
            access_token: at,
            refresh_token: rt,
        };
    }

    /**
     * Send verification email (used by controller for resend)
     */
    async sendVerificationEmail(email: string, code: string): Promise<void> {
        await this.emailService.sendVerificationCode(email, code);
    }
}
