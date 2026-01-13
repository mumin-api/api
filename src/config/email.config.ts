import { registerAs } from '@nestjs/config';

export default registerAs('email', () => ({
    provider: process.env.EMAIL_PROVIDER || 'sendgrid',
    sendgridApiKey: process.env.SENDGRID_API_KEY,
    resendApiKey: process.env.RESEND_API_KEY,
    resendWebhookSecret: process.env.RESEND_WEBHOOK_SECRET,
    fromAddress: process.env.EMAIL_FROM_ADDRESS || 'noreply@mumin.ink',
    fromName: process.env.EMAIL_FROM_NAME || 'Mumin Hadith API',
}));
