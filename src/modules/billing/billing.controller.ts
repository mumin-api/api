import { Controller, Get, Query, UseGuards, ParseIntPipe, Post, Body, Headers, DefaultValuePipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { BillingService } from './billing.service';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { Public } from '@/common/decorators/public.decorator';
import { CryptoPayWebhook } from './billing.types';
import { AuthenticatedUser } from '@/common/interfaces/user.interface';

@ApiTags('billing')
@Controller('billing')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('jwt')
export class BillingController {
    constructor(private billingService: BillingService) { }

    @Get('balance')
    @ApiOperation({ summary: 'Get current balance' })
    async getBalance(@CurrentUser() user: AuthenticatedUser) {
        return this.billingService.getBalanceByUserEmail(user.email);
    }

    @Get('transactions')
    @ApiOperation({ summary: 'Get transaction history' })
    async getTransactions(
        @CurrentUser() user: AuthenticatedUser,
        @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
        @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    ) {
        return this.billingService.getTransactions(user.userId, page, limit);
    }

    @Get('payments')
    @ApiOperation({ summary: 'Get payment history' })
    async getPayments(@CurrentUser() user: AuthenticatedUser) {
        return this.billingService.getPayments(user.userId);
    }

    @Get('stats')
    @ApiOperation({ summary: 'Get account usage stats' })
    async getStats(@CurrentUser() user: AuthenticatedUser) {
        return this.billingService.getUsageStats(user.userId);
    }

    @Get('analytics/usage')
    @ApiOperation({ summary: 'Get daily usage stats for last N days (real data)' })
    async getUsageByDay(
        @CurrentUser() user: AuthenticatedUser,
        @Query('days', new ParseIntPipe({ optional: true })) days?: number,
    ) {
        return this.billingService.getUsageByDay(user.userId, days ?? 7);
    }

    @Post('crypto/create-invoice')
    @ApiOperation({ summary: 'Create CryptoBot invoice' })
    async createInvoice(
        @CurrentUser() user: AuthenticatedUser,
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
