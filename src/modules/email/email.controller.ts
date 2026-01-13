import { Controller, Post, Body, Headers } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { EmailService } from './email.service';
import { Public } from '@/common/decorators/public.decorator';

@ApiTags('webhooks')
@Controller('webhooks')
export class EmailController {
    constructor(private emailService: EmailService) { }

    @Post('sendgrid')
    @Public()
    @ApiOperation({ summary: 'SendGrid webhook for email events' })
    async handleSendGridWebhook(@Body() body: any) {
        await this.emailService.handleWebhook(body);
        return { success: true };
    }

    @Post('resend')
    @Public()
    @ApiOperation({ summary: 'Resend webhook for email events' })
    async handleResendWebhook(@Body() body: any, @Headers() headers: any) {
        await this.emailService.handleResendWebhook(body, headers);
        return { success: true };
    }
}
