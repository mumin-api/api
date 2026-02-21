import {
    Controller,
    Get,
    Post,
    Patch,
    Param,
    Body,
    Query,
    UseGuards,
    ParseIntPipe,
    DefaultValuePipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiHeader } from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { AdminGuard } from '@/common/guards/admin.guard';

@ApiTags('admin')
@Controller('admin')
@UseGuards(AdminGuard)
@ApiHeader({
    name: 'x-admin-key',
    description: 'Admin API key',
    required: true,
})
export class AdminController {
    constructor(private adminService: AdminService) { }

    @Get('keys')
    @ApiOperation({ summary: 'List all API keys' })
    async listKeys(
        @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
        @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
        @Query('email') email?: string,
        @Query('isActive') isActive?: boolean,
    ) {
        return this.adminService.listKeys(page, limit, { email, isActive });
    }

    @Get('keys/:id')
    @ApiOperation({ summary: 'Get detailed key information' })
    async getKeyDetails(@Param('id', ParseIntPipe) id: number) {
        return this.adminService.getKeyDetails(id);
    }

    @Patch('keys/:id/suspend')
    @ApiOperation({ summary: 'Suspend account' })
    async suspendAccount(
        @Param('id', ParseIntPipe) id: number,
        @Body() body: { reason: string },
    ) {
        return this.adminService.suspendAccount(id, body.reason);
    }

    @Patch('keys/:id/unsuspend')
    @ApiOperation({ summary: 'Unsuspend account' })
    async unsuspendAccount(@Param('id', ParseIntPipe) id: number) {
        return this.adminService.unsuspendAccount(id);
    }

    @Post('keys/:id/balance')
    @ApiOperation({ summary: 'Add balance to account' })
    async addBalance(
        @Param('id', ParseIntPipe) id: number,
        @Body() body: { amount: number; description: string },
    ) {
        return this.adminService.addBalance(id, body.amount, body.description);
    }

    @Get('fraud-events')
    @ApiOperation({ summary: 'Get fraud events' })
    async getFraudEvents(
        @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
        @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    ) {
        return this.adminService.getFraudEvents(page, limit);
    }

    @Get('stats')
    @ApiOperation({ summary: 'Get system statistics' })
    async getStats() {
        return this.adminService.getStats();
    }
}
