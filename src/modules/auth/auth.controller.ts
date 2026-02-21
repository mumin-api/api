import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards, Res, Req, Get, Patch, Query, Param, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto, LoginDto, UpdateProfileDto, ClaimTelegramDto, RequestEmailChangeDto, VerifyEmailChangeDto } from './dto/auth.dto';
import { Response, Request } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { VerificationService } from './verification.service';
import { Public } from '@/common/decorators/public.decorator';
import { ApiKeysService } from '../api-keys/api-keys.service';
import { ConfigService } from '@nestjs/config';
import { AuthenticatedUser } from '@/common/interfaces/user.interface';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
    constructor(
        private authService: AuthService,
        private verificationService: VerificationService,
        private apiKeysService: ApiKeysService,
        private config: ConfigService,
    ) { }

    @Post('register')
    @HttpCode(HttpStatus.CREATED)
    @ApiOperation({ summary: 'Register new user' })
    async register(@Body() dto: RegisterDto, @Res({ passthrough: true }) res: Response) {
        const tokens = await this.authService.register(dto);
        this.setCookies(res, tokens.access_token, tokens.refresh_token);
        return { success: true, message: 'Registered successfully' };
    }

    @Post('login')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Login user' })
    async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
        const result = await this.authService.login(dto);
        this.setCookies(res, result.access_token, result.refresh_token);

        // Remove tokens from response body as they are in cookies
        const { access_token, refresh_token, ...response } = result;
        return response;
    }

    @UseGuards(AuthGuard('jwt'))
    @Post('logout')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Logout user' })
    async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
        // userId comes from JwtStrategy validate() which returns { userId: sub ... }
        if (req.user) {
            await this.authService.logout(req.user.userId);
        }
        res.clearCookie('access_token');
        res.clearCookie('refresh_token');
        res.clearCookie('logged_in');
        return { success: true, message: 'Logged out successfully' };
    }

    @UseGuards(AuthGuard('jwt-refresh'))
    @Post('refresh')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Refresh tokens' })
    async refreshTokens(@Req() req: any, @Res({ passthrough: true }) res: Response) {
        // req.user has { refreshToken, sub, email } from RtStrategy
        const userId = req.user['sub'];
        const refreshToken = req.user['refreshToken'];
        const tokens = await this.authService.refreshTokens(userId, refreshToken);

        this.setCookies(res, tokens.access_token, tokens.refresh_token);
        return { success: true, message: 'Tokens refreshed' };
    }

    @UseGuards(AuthGuard('jwt'))
    @Get('me')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Get current user profile' })
    async getMe(@Req() req: Request) {
        return this.authService.getMe(req.user!.userId);
    }

    @UseGuards(AuthGuard('jwt'))
    @Patch('profile')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Update user profile' })
    async updateProfile(
        @Req() req: Request,
        @Body() dto: UpdateProfileDto,
        @Res({ passthrough: true }) res: Response
    ) {
        const result = await this.authService.updateProfile(req.user!.userId, dto);
        this.setCookies(res, result.access_token, result.refresh_token);

        // Remove tokens from response body
        const { access_token, refresh_token, ...response } = result;
        return response;
    }

    @UseGuards(AuthGuard('jwt'))
    @Post('telegram/claim')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Link Telegram account via token' })
    async claimTelegram(@Req() req: any, @Body() dto: ClaimTelegramDto) {
        return this.authService.claimTelegram(req.user.userId, dto.token);
    }

    @UseGuards(AuthGuard('jwt'))
    @Post('request-email-change')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Request email change' })
    async requestEmailChange(@Req() req: any, @Body() dto: RequestEmailChangeDto) {
        return this.authService.requestEmailChange(req.user.userId, dto.newEmail);
    }

    @UseGuards(AuthGuard('jwt'))
    @Post('verify-email-change')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Verify email change with code' })
    async verifyEmailChange(
        @Req() req: any,
        @Body() dto: VerifyEmailChangeDto,
        @Res({ passthrough: true }) res: Response
    ) {
        const result = await this.authService.verifyEmailChange(req.user.userId, dto.code);
        this.setCookies(res, result.access_token, result.refresh_token);
        
        const { access_token, refresh_token, ...response } = result;
        return response;
    }

    @Public()
    @Get('telegram/sync/:telegramId')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Internal: Sync Telegram account status' })
    async syncTelegram(@Param('telegramId') telegramId: string, @Req() req: Request) {
        const secretHeader = req.headers['x-internal-key'];
        const secret = Array.isArray(secretHeader) ? secretHeader[0] : secretHeader;
        
        if (secret !== process.env.INTERNAL_BOT_KEY) {
            console.warn(`[Auth] Internal Sync Failed: Key Mismatch. Received: ${secret ? secret.substring(0, 5) + '...' : 'NONE'}, Expected: ${process.env.INTERNAL_BOT_KEY ? 'DEFINED' : 'UNDEFINED'}`);
            throw new UnauthorizedException('Invalid internal key');
        }
        
        return this.apiKeysService.syncTelegramStatus(telegramId);
    }

    // ============================================
    // EMAIL VERIFICATION ENDPOINTS
    // ============================================

    @Public()
    @Post('verify-email')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Verify email with code' })
    async verifyEmail(
        @Body() body: { email: string; code: string },
        @Req() req: Request,
    ) {
        await this.verificationService.verifyCode(
            body.email,
            body.code,
            req.ip,
            req.headers['user-agent'],
        );
        return {
            success: true,
            message: 'Email verified successfully. You can now log in.',
        };
    }

    @Public()
    @Post('resend-code')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Resend verification code' })
    async resendCode(
        @Body() body: { email: string },
        @Req() req: Request,
    ) {
        const { code } = await this.verificationService.sendVerificationCode(
            body.email,
            req.ip,
            req.headers['user-agent'],
        );

        // Send email via AuthService
        await this.authService.sendVerificationEmail(body.email, code);

        return {
            success: true,
            message: 'Verification code sent to your email.',
        };
    }

    @Public()
    @Get('verification-status')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Check email verification status' })
    async getVerificationStatus(@Query('email') email: string) {
        const status = await this.verificationService.getVerificationStatus(email);
        return status;
    }

    private setCookies(res: Response, accessToken: string, refreshToken: string) {
        const domain = this.config.get<string>('COOKIE_DOMAIN');
        const cookieOptions: any = {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax', // 'none' for cross-domain in production
            path: '/', // Ensure cookie is available for all routes
        };

        if (domain) {
            cookieOptions.domain = domain;
        }
        
        res.cookie('access_token', accessToken, {
            ...cookieOptions,
            maxAge: 15 * 60 * 1000, // 15m
        });

        res.cookie('refresh_token', refreshToken, {
            ...cookieOptions,
            maxAge: 7 * 24 * 60 * 60 * 1000, // 7d
        });

        res.cookie('logged_in', 'true', {
            ...cookieOptions,
            httpOnly: false, // Accessible by client JS
            maxAge: 7 * 24 * 60 * 60 * 1000, // Sync with refresh token
        });
    }
}
