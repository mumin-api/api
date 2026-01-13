import { Injectable, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { PrismaService } from '@/prisma/prisma.service'
import { RegisterDto } from './dto/register.dto'
import { LoginDto } from './dto/login.dto'
import * as bcrypt from 'bcrypt'

@Injectable()
export class AuthService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly jwtService: JwtService,
    ) { }

    async register(dto: RegisterDto) {
        // Hash password
        const hashedPassword = await bcrypt.hash(dto.password, 10)

        // Create user
        const user = await this.prisma.user.create({
            data: {
                email: dto.email,
                password: hashedPassword,
                displayName: dto.displayName || dto.email.split('@')[0],
                tosAccepted: dto.tosAccepted,
                tosVersion: dto.tosVersion,
                privacyAccepted: dto.privacyAccepted,
                privacyVersion: dto.privacyVersion,
            },
        })

        // Generate tokens
        const { accessToken, refreshToken } = await this.generateTokens(user.id, user.email)

        // Save refresh token hash
        await this.updateRefreshToken(user.id, refreshToken)

        return {
            user: this.sanitizeUser(user),
            accessToken,
            refreshToken,
        }
    }

    async login(dto: LoginDto) {
        // Find user
        const user = await this.prisma.user.findUnique({
            where: { email: dto.email },
        })

        if (!user) {
            throw new UnauthorizedException('Invalid credentials')
        }

        // Verify password
        const isPasswordValid = await bcrypt.compare(dto.password, user.password)

        if (!isPasswordValid) {
            throw new UnauthorizedException('Invalid credentials')
        }

        // Generate tokens
        const { accessToken, refreshToken } = await this.generateTokens(user.id, user.email)

        // Save refresh token hash
        await this.updateRefreshToken(user.id, refreshToken)

        return {
            user: this.sanitizeUser(user),
            accessToken,
            refreshToken,
        }
    }

    async refreshTokens(refreshToken: string) {
        try {
            // Verify refresh token
            const payload = this.jwtService.verify(refreshToken, {
                secret: process.env.JWT_REFRESH_SECRET,
            })

            // Get user
            const user = await this.prisma.user.findUnique({
                where: { id: payload.sub },
            })

            if (!user || !user.refreshToken) {
                throw new UnauthorizedException('Invalid refresh token')
            }

            // Verify refresh token hash
            const isTokenValid = await bcrypt.compare(refreshToken, user.refreshToken)

            if (!isTokenValid) {
                throw new UnauthorizedException('Invalid refresh token')
            }

            // Generate new tokens
            const tokens = await this.generateTokens(user.id, user.email)

            // Save new refresh token hash
            await this.updateRefreshToken(user.id, tokens.refreshToken)

            return tokens
        } catch (error) {
            throw new UnauthorizedException('Invalid refresh token')
        }
    }

    async logout(userId: string) {
        // Clear refresh token
        await this.prisma.user.update({
            where: { id: userId },
            data: { refreshToken: null },
        })
    }

    /**
     * Generate access and refresh tokens
     */
    private async generateTokens(userId: string, email: string) {
        const payload = { sub: userId, email }

        const [accessToken, refreshToken] = await Promise.all([
            // Access token - 15 minutes
            this.jwtService.signAsync(payload, {
                secret: process.env.JWT_SECRET,
                expiresIn: '15m',
            }),
            // Refresh token - 7 days
            this.jwtService.signAsync(payload, {
                secret: process.env.JWT_REFRESH_SECRET,
                expiresIn: '7d',
            }),
        ])

        return { accessToken, refreshToken }
    }

    /**
     * Update refresh token hash in database
     */
    private async updateRefreshToken(userId: string, refreshToken: string) {
        const hashedToken = await bcrypt.hash(refreshToken, 10)

        await this.prisma.user.update({
            where: { id: userId },
            data: { refreshToken: hashedToken },
        })
    }

    /**
     * Remove sensitive fields from user object
     */
    private sanitizeUser(user: any) {
        const { password, refreshToken, ...sanitized } = user
        return sanitized
    }
}
