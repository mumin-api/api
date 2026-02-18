import { Controller, Get, Query, UseGuards, ParseIntPipe, Post, Body, Headers } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { BillingService } from './billing.service';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { Public } from '@/common/decorators/public.decorator';
import { CryptoPayWebhook } from './billing.types';

@ApiTags('billing')
@Controller('billing')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('jwt')
export class BillingController {
    constructor(private billingService: BillingService) { }

    @Get('balance')
    @ApiOperation({ summary: 'Get current balance' })
    async getBalance(@CurrentUser() user: any) {
        return this.billingService.getBalanceByUserEmail(user.email);
    }

    @Get('transactions')
    @ApiOperation({ summary: 'Get transaction history' })
    async getTransactions(
        @CurrentUser() user: any,
        @Query('page', new ParseIntPipe({ optional: true })) page?: number,
        @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
    ) {
        return this.billingService.getTransactions(user.userId, page, limit);
    }

    @Get('payments')
    @ApiOperation({ summary: 'Get payment history' })
    async getPayments(@CurrentUser() user: any) {
        return this.billingService.getPayments(user.userId);
    }

    @Get('stats')
    @ApiOperation({ summary: 'Get account usage stats' })
    async getStats(@CurrentUser() user: any) {
        return this.billingService.getUsageStats(user.userId);
    }

    @Get('analytics/usage')
    @ApiOperation({ summary: 'Get daily usage stats for last N days (real data)' })
    async getUsageByDay(
        @CurrentUser() user: any,
        @Query('days', new ParseIntPipe({ optional: true })) days?: number,
    ) {
        return this.billingService.getUsageByDay(user.userId, days ?? 7);
    }

    @Post('crypto/create-invoice')
    @ApiOperation({ summary: 'Create CryptoBot invoice' })
    async createInvoice(
        @CurrentUser() user: any,
        @Body('amount', ParseIntPipe) amount: number
    ) {
        return this.billingService.createCryptoInvoice(user.userId, amount);
    }

    @Public()
    @Post('crypto/webhook')
    @ApiOperation({ summary: 'CryptoBot webhook' })
    async handleWebhook(
        @Body() payload: CryptoPayWebhook,
        @Headers('crypto-pay-api-signature') signature: string
    ) {
        return this.billingService.handleCryptoWebhook(payload, signature);
    }
}
