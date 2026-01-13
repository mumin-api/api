import {
    Controller,
    Post,
    Body,
    Res,
    HttpCode,
    HttpStatus,
    UseGuards,
    Get,
    Req,
} from '@nestjs/common'
import { Response, Request } from 'express'
import { AuthService } from './auth.service'
import { RegisterDto } from './dto/register.dto'
import { LoginDto } from './dto/login.dto'
import { Public } from '@/common/decorators/public.decorator'
import { RefreshGuard } from '@/common/guards/refresh.guard'

@Controller('auth')
export class AuthController {
    constructor(private readonly authService: AuthService) { }

    @Public()
    @Post('register')
    @HttpCode(HttpStatus.CREATED)
    async register(
        @Body() dto: RegisterDto,
        @Res({ passthrough: true }) response: Response,
    ) {
        const result = await this.authService.register(dto)

        // Set httpOnly cookies
        this.setAuthCookies(response, result.accessToken, result.refreshToken)

        return {
            success: true,
            user: result.user,
            message: 'Registration successful',
        }
    }

    @Public()
    @Post('login')
    @HttpCode(HttpStatus.OK)
    async login(
        @Body() dto: LoginDto,
        @Res({ passthrough: true }) response: Response,
    ) {
        const result = await this.authService.login(dto)

        // Set httpOnly cookies
        this.setAuthCookies(response, result.accessToken, result.refreshToken)

        return {
            success: true,
            user: result.user,
            message: 'Login successful',
        }
    }

    @Public()
    @Post('refresh')
    @UseGuards(RefreshGuard)
    @HttpCode(HttpStatus.OK)
    async refresh(
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response,
    ) {
        const refreshToken = request.cookies['refresh_token']
        const result = await this.authService.refreshTokens(refreshToken)

        // Set new httpOnly cookies
        this.setAuthCookies(response, result.accessToken, result.refreshToken)

        return {
            success: true,
            message: 'Tokens refreshed',
        }
    }

    @Post('logout')
    @HttpCode(HttpStatus.OK)
    async logout(@Res({ passthrough: true }) response: Response) {
        // Clear cookies
        this.clearAuthCookies(response)

        return {
            success: true,
            message: 'Logout successful',
        }
    }

    @Get('me')
    async getCurrentUser(@Req() request: Request) {
        return {
            success: true,
            user: request['user'],
        }
    }

    /**
     * Set httpOnly authentication cookies
     */
    private setAuthCookies(
        response: Response,
        accessToken: string,
        refreshToken: string,
    ) {
        const isProduction = process.env.NODE_ENV === 'production'

        // Access token - short lived (15 minutes)
        response.cookie('access_token', accessToken, {
            httpOnly: true, // JavaScript cannot read
            secure: isProduction, // HTTPS only in production
            sameSite: 'strict', // CSRF protection
            maxAge: 15 * 60 * 1000, // 15 minutes
            path: '/',
        })

        // Refresh token - long lived (7 days)
        response.cookie('refresh_token', refreshToken, {
            httpOnly: true,
            secure: isProduction,
            sameSite: 'strict',
            maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
            path: '/auth/refresh', // Only sent to refresh endpoint
        })
    }

    /**
     * Clear authentication cookies
     */
    private clearAuthCookies(response: Response) {
        response.clearCookie('access_token', { path: '/' })
        response.clearCookie('refresh_token', { path: '/auth/refresh' })
    }
}
