import { Controller, Post, Get, Patch, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ApiKeysService } from './api-keys.service';
import { RegisterApiKeyDto } from './dto/register-key.dto';
import { Public } from '@/common/decorators/public.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { ApiKeyGuard } from '@/common/guards/api-key.guard';
import { Request } from 'express';
import { Req } from '@nestjs/common';
import { GeolocationUtil } from '@/common/utils/geolocation.util';

@ApiTags('auth')
@Controller('auth')
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
            (req as any)['deviceFingerprint'] || '',
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
    @UseGuards(ApiKeyGuard)
    @ApiBearerAuth('api-key')
    @ApiOperation({ summary: 'Get current API key information' })
    async getMe(@CurrentUser() user: any) {
        return this.apiKeysService.getKeyInfo(user.apiKeyId);
    }

    @Post('rotate')
    @UseGuards(ApiKeyGuard)
    @ApiBearerAuth('api-key')
    @ApiOperation({ summary: 'Rotate API key (generate new key)' })
    async rotate(@CurrentUser() user: any) {
        return this.apiKeysService.rotateKey(user.apiKeyId);
    }

    @Patch('settings')
    @UseGuards(ApiKeyGuard)
    @ApiBearerAuth('api-key')
    @ApiOperation({ summary: 'Update API key settings' })
    async updateSettings(
        @CurrentUser() user: any,
        @Body() settings: { allowedIPs?: string[]; webhookUrl?: string },
    ) {
        return this.apiKeysService.updateSettings(user.apiKeyId, settings);
    }
}
