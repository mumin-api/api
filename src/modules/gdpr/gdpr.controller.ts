import { Controller, Post, Get, Put, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ApiKeyGuard } from '@/common/guards/api-key.guard';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { DataExportService } from './data-export.service';
import { DataDeletionService } from './data-deletion.service';
import { ConsentService } from './consent.service';
import { Public } from '@/common/decorators/public.decorator';

@ApiTags('gdpr')
@Controller('user')
export class GdprController {
    constructor(
        private exportService: DataExportService,
        private deletionService: DataDeletionService,
        private consentService: ConsentService,
    ) { }

    @Get('consent')
    @Public()
    @ApiOperation({ summary: 'Get current cookie consent state' })
    async getConsent(@CurrentUser() user: any) {
        return this.consentService.getConsent(user?.apiKeyId);
    }

    @Put('consent')
    @UseGuards(ApiKeyGuard)
    @ApiBearerAuth('api-key')
    @ApiOperation({ summary: 'Update cookie consent state' })
    async updateConsent(@CurrentUser() user: any, @Body() body: any) {
        return this.consentService.updateConsent(user.apiKeyId, body);
    }

    @Post('export')
    @UseGuards(ApiKeyGuard)
    @ApiBearerAuth('api-key')
    @ApiOperation({ summary: 'Request data export (GDPR)' })
    async requestExport(
        @CurrentUser() user: any,
        @Body() body: { format?: 'json' | 'csv' },
    ) {
        return this.exportService.requestExport(user.apiKeyId, body.format);
    }

    @Post('delete')
    @UseGuards(ApiKeyGuard)
    @ApiBearerAuth('api-key')
    @ApiOperation({ summary: 'Request account deletion (GDPR)' })
    async requestDeletion(@CurrentUser() user: any, @Body() body: { reason?: string }) {
        return this.deletionService.requestDeletion(user.apiKeyId, body.reason);
    }

    @Get('delete/confirm/:token')
    @Public()
    @ApiOperation({ summary: 'Confirm account deletion' })
    async confirmDeletion(@Param('token') token: string) {
        return this.deletionService.confirmDeletion(token);
    }

    @Delete('delete/cancel')
    @UseGuards(ApiKeyGuard)
    @ApiBearerAuth('api-key')
    @ApiOperation({ summary: 'Cancel deletion request' })
    async cancelDeletion(@CurrentUser() user: any) {
        return this.deletionService.cancelDeletion(user.apiKeyId);
    }
}
