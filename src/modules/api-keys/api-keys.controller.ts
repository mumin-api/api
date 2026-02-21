import { Controller, Post, Get, Patch, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ApiKeysService } from './api-keys.service';
import { RegisterApiKeyDto } from './dto/register-key.dto';
import { Public } from '@/common/decorators/public.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { Request } from 'express';
import { Req } from '@nestjs/common';
import { GeolocationUtil } from '@/common/utils/geolocation.util';
import { AuthenticatedUser } from '@/common/interfaces/user.interface';

@ApiTags('api-keys')
@Controller('keys')
export class ApiKeysController {
    constructor(
        private apiKeysService: ApiKeysService,
        private geoUtil: GeolocationUtil,
    ) { }

    @Post('register')
    @Public()
    @ApiOperation({ summary: 'Register new API key with legal compliance' })
    async register(@Body() dto: RegisterApiKeyDto, @Req() req: Request) {
        return this.apiKeysService.register(
            dto,
            req.ip || 'unknown',
            req.headers['user-agent'] || '',
            req.deviceFingerprint || '',
            this.geoUtil.getLocation(req.ip || '') || 'unknown',
        );
    }

    @Post('create')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth('jwt')
    @ApiOperation({ summary: 'Create API key for authenticated user' })
    async create(@CurrentUser() user: AuthenticatedUser, @Req() req: Request) {
        console.log(`[API_KEYS] create for ${user?.email}`);
        return this.apiKeysService.register(
            {
                email: user.email,
                acceptTerms: true,
                termsVersion: '1.0',
                acceptPrivacyPolicy: true,
                privacyPolicyVersion: '1.0',
            } as any,
            req.ip || 'unknown',
            req.headers['user-agent'] || '',
            '',
            this.geoUtil.getLocation(req.ip || '') || 'unknown',
        );
    }

    @Post('refresh')
    @Public()
    @ApiOperation({ summary: 'Stub for token refresh' })
    async refresh() {
        return { success: true, message: 'Refresh successful' };
    }

    @Get('me')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth('jwt')
    @ApiOperation({ summary: 'Get current API key information' })
    async getMe(@CurrentUser() user: AuthenticatedUser) {
        console.log(`[API_KEYS] getMe for ${user?.email}`);
        return this.apiKeysService.getKeysByUserEmail(user.email);
    }

    @Post('rotate')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth('jwt')
    @ApiOperation({ summary: 'Rotate API key (generate new key)' })
    async rotate(@CurrentUser() user: AuthenticatedUser) {
        console.log(`[API_KEYS] rotate for ${user?.email}`);
        return this.apiKeysService.rotateKeyByUserEmail(user.email);
    }

    @Patch('settings')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth('jwt')
    @ApiOperation({ summary: 'Update API key settings' })
    async updateSettings(
        @CurrentUser() user: AuthenticatedUser,
        @Body() settings: { allowedIPs?: string[]; webhookUrl?: string },
    ) {
        return this.apiKeysService.updateSettingsByUserEmail(user.email, settings);
    }
}
