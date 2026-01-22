import { Injectable, ForbiddenException, BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { RegisterDto, LoginDto, UpdateProfileDto } from './dto/auth.dto';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { VerificationService } from './verification.service';
import { EmailService } from '../email/email.service';

@Injectable()
export class AuthService {
    constructor(
        private prisma: PrismaService,
        private jwtService: JwtService,
        private config: ConfigService,
        private verificationService: VerificationService,
        private emailService: EmailService,
    ) { }

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
        };
    }

    async updateProfile(userId: number, dto: UpdateProfileDto) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
        });

        if (!user) throw new NotFoundException('User not found');

        // Check if email is being changed and if it's already taken
        if (dto.email && dto.email !== user.email) {
            const existingUser = await this.prisma.user.findUnique({
                where: { email: dto.email },
            });
            if (existingUser) {
                throw new ForbiddenException('Email already taken');
            }
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
                email: dto.email ?? user.email,
                firstName: firstName ?? user.firstName,
                lastName: lastName ?? user.lastName,
            },
        });

        // If email changed, update associated API keys
        if (dto.email && dto.email !== user.email) {
            await this.prisma.apiKey.updateMany({
                where: { userEmail: user.email },
                data: { userEmail: dto.email },
            });
        }

        // Generate new tokens with updated email
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
