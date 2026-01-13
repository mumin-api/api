import { Controller, Get, Query, UseGuards, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { BillingService } from './billing.service';
import { ApiKeyGuard } from '@/common/guards/api-key.guard';
import { CurrentUser } from '@/common/decorators/current-user.decorator';

@ApiTags('billing')
@Controller('billing')
@UseGuards(ApiKeyGuard)
@ApiBearerAuth('api-key')
export class BillingController {
    constructor(private billingService: BillingService) { }

    @Get('balance')
    @ApiOperation({ summary: 'Get current balance' })
    async getBalance(@CurrentUser() user: any) {
        return this.billingService.getBalance(user.apiKeyId);
    }

    @Get('transactions')
    @ApiOperation({ summary: 'Get transaction history' })
    async getTransactions(
        @CurrentUser() user: any,
        @Query('page', new ParseIntPipe({ optional: true })) page?: number,
        @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
    ) {
        return this.billingService.getTransactions(user.apiKeyId, page, limit);
    }

    @Get('payments')
    @ApiOperation({ summary: 'Get payment history' })
    async getPayments(@CurrentUser() user: any) {
        return this.billingService.getPayments(user.apiKeyId);
    }
}
