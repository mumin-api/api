import { Controller, Post, Get, Put, Delete, Param, Body, UseGuards, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UnifiedAuthGuard } from '@/common/guards/unified-auth.guard';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { DataExportService } from './data-export.service';
import { DataDeletionService } from './data-deletion.service';
import { ConsentService } from './consent.service';
import { Public } from '@/common/decorators/public.decorator';
import { AuthenticatedUser } from '@/common/interfaces/user.interface';

@ApiTags('gdpr')
@Controller('user')
export class GdprController {
    constructor(
        private exportService: DataExportService,
        private deletionService: DataDeletionService,
        private consentService: ConsentService,
    ) { }

    @Get('consent')
    @UseGuards(UnifiedAuthGuard)
    @ApiOperation({ summary: 'Get current cookie consent state' })
    async getConsent(@CurrentUser() user: AuthenticatedUser) {
        return this.consentService.getConsent(user.userId, user.apiKeyId);
    }

    @Put('consent')
    @UseGuards(UnifiedAuthGuard)
    @ApiBearerAuth('api-key')
    @ApiOperation({ summary: 'Update cookie consent state' })
    async updateConsent(@CurrentUser() user: AuthenticatedUser, @Body() body: any) {
        return this.consentService.updateConsent(body, user.userId, user.apiKeyId);
    }

    @Post('export')
    @UseGuards(UnifiedAuthGuard)
    @ApiBearerAuth('api-key')
    @ApiOperation({ summary: 'Request data export (GDPR)' })
    async requestExport(
        @CurrentUser() user: AuthenticatedUser,
        @Body() body: { format?: 'json' | 'csv' },
    ) {
        if (!user.apiKeyId) throw new BadRequestException('API Key required for this operation');
        return this.exportService.requestExport(user.apiKeyId, user.userId, body.format);
    }

    @Post('delete')
    @UseGuards(UnifiedAuthGuard)
    @ApiBearerAuth('api-key')
    @ApiOperation({ summary: 'Request account deletion (GDPR)' })
    async requestDeletion(@CurrentUser() user: AuthenticatedUser, @Body() body: { reason?: string }) {
        if (!user.apiKeyId) throw new BadRequestException('API Key required for this operation');
        return this.deletionService.requestDeletion(user.apiKeyId, user.userId, body.reason);
    }

    @Get('delete/confirm/:token')
    @Public()
    @ApiOperation({ summary: 'Confirm account deletion' })
    async confirmDeletion(@Param('token') token: string) {
        return this.deletionService.confirmDeletion(token);
    }

    @Delete('delete/cancel')
    @UseGuards(UnifiedAuthGuard)
    @ApiBearerAuth('api-key')
    @ApiOperation({ summary: 'Cancel deletion request' })
    async cancelDeletion(@CurrentUser() user: AuthenticatedUser) {
        return this.deletionService.cancelDeletion(user.apiKeyId!);
    }
}
