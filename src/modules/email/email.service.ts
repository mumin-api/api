import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@/prisma/prisma.service';
import * as sendgrid from '@sendgrid/mail';
import { Resend } from 'resend';

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  emailType: string;
  apiKeyId: number;
  metadata?: any;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private resend: Resend | null = null;
  private provider: string;

  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
  ) {
    this.provider = this.config.get('email.provider') || 'sendgrid';

    // Initialize SendGrid
    const sgApiKey = this.config.get('email.sendgridApiKey');
    if (sgApiKey) {
      sendgrid.setApiKey(sgApiKey);
    }

    // Initialize Resend
    const resendApiKey = this.config.get('email.resendApiKey');
    if (resendApiKey) {
      this.resend = new Resend(resendApiKey);
    }
  }

  async sendEmail(options: SendEmailOptions): Promise<void> {
    const { to, subject, html, emailType, apiKeyId, metadata } = options;
    const fromName = this.config.get('email.fromName') || 'Mumin Hadith API';
    const fromEmail = this.config.get('email.fromAddress') || 'noreply@mumin.ink';
    const from = `${fromName} <${fromEmail}>`;

    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts) {
      try {
        let messageId = `failed_${Date.now()}`;
        let providerUsed = this.provider;

        if (this.provider === 'resend' && this.resend) {
          const { data, error } = await this.resend.emails.send({
            from,
            to: [to],
            subject,
            html,
          });

          if (error) {
            throw new Error(error.message);
          }
          messageId = data?.id || `resend_${Date.now()}`;
        } else {
          // Default to SendGrid
          const msg = {
            to,
            from: fromEmail,
            subject,
            html,
            trackingSettings: {
              clickTracking: { enable: true },
              openTracking: { enable: true },
            },
          };

          const response = await sendgrid.send(msg);
          messageId = response[0].headers['x-message-id'] as string;
          providerUsed = 'sendgrid';
        }

        // Log email in database
        await this.prisma.emailLog.create({
          data: {
            apiKeyId,
            emailType,
            recipient: to,
            subject,
            messageId,
            provider: providerUsed,
            metadata,
          },
        });

        this.logger.log(`Email sent via ${providerUsed}: ${emailType} to ${to} (Attempt ${attempts + 1})`);
        return; // Success!
      } catch (error) {
        attempts++;
        this.logger.error(`Failed to send email to ${to} via ${this.provider} (Attempt ${attempts}/${maxAttempts}):`, error);

        if (attempts >= maxAttempts) {
          // Log final failure
          await this.prisma.emailLog.create({
            data: {
              apiKeyId,
              emailType,
              recipient: to,
              subject,
              bounced: true,
              bounceReason: error.message,
              messageId: `failed_${Date.now()}`,
              provider: this.provider,
              metadata,
            },
          });
        } else {
          // Wait before retry
          await new Promise(resolve => setTimeout(resolve, 1000 * attempts));
        }
      }
    }
  }

  /**
   * Webhook handler for Resend events
   */
  async handleResendWebhook(payload: any, headers: any): Promise<void> {
    const secret = this.config.get('email.resendWebhookSecret');

    // signature verification if secret is provided
    if (secret) {
      try {
        const { Webhook } = require('svix');
        const wh = new Webhook(secret);
        payload = wh.verify(JSON.stringify(payload), headers);
      } catch (err) {
        this.logger.error('Resend webhook signature verification failed', err);
        throw new Error('Invalid signature');
      }
    }

    const event = payload.type;
    const data = payload.data;
    const messageId = data.email_id;

    const updateData: any = {};

    switch (event) {
      case 'email.sent':
        updateData.sentAt = new Date(data.created_at);
        break;
      case 'email.delivered':
        updateData.deliveredAt = new Date();
        break;
      case 'email.opened':
        updateData.openedAt = new Date();
        break;
      case 'email.bounced':
        updateData.bounced = true;
        updateData.bounceReason = 'Hard bounce detected by Resend';
        break;
      case 'email.complained':
        updateData.bounced = true;
        updateData.bounceReason = 'Spam report (Complained)';
        break;
    }

    if (Object.keys(updateData).length > 0 && messageId) {
      await this.prisma.emailLog.updateMany({
        where: { messageId },
        data: updateData,
      });
    }
  }

  /**
   * Webhook handler for email events (delivered, opened, clicked)
   */
  async handleWebhook(events: any[]): Promise<void> {
    for (const event of events) {
      const messageId = event.sg_message_id;

      const updateData: any = {};

      switch (event.event) {
        case 'delivered':
          updateData.deliveredAt = new Date(event.timestamp * 1000);
          break;
        case 'open':
          updateData.openedAt = new Date(event.timestamp * 1000);
          break;
        case 'click':
          updateData.clickedAt = new Date(event.timestamp * 1000);
          break;
        case 'bounce':
        case 'dropped':
          updateData.bounced = true;
          updateData.bounceReason = event.reason;
          break;
      }

      if (Object.keys(updateData).length > 0) {
        await this.prisma.emailLog.updateMany({
          where: { messageId },
          data: updateData,
        });
      }
    }
  }

  /**
   * Send inactivity warning email
   */
  async sendInactivityWarning(apiKey: any, daysUntilDormant: number): Promise<void> {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>⚠️ Account Inactivity Warning</h2>
        
        <p>Hi${apiKey.userEmail ? ` ${apiKey.userEmail}` : ''},</p>
        
        <p>Your API account has been inactive for a while.</p>
        
        <div style="background: #fff3cd; border: 1px solid #ffc107; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <strong>In ${daysUntilDormant} days</strong>, your account will be classified as "dormant" 
          and subject to a <strong>$5/month</strong> maintenance fee.
        </div>
        
        <h3>To avoid this:</h3>
        <ul>
          <li>Make ANY API request</li>
          <li>Or login to your dashboard</li>
        </ul>
        
        <p><strong>Current balance:</strong> $${(apiKey.balance * 0.001).toFixed(2)} (${apiKey.balance} credits)</p>
        
        <div style="margin: 30px 0;">
          <a href="${this.config.get('app.dashboardUrl')}/login" 
             style="background: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
            Reactivate My Account
          </a>
        </div>
        
        <p style="color: #666; font-size: 12px; margin-top: 30px;">
          Questions? Reply to this email.<br>
          This is an automated message. Please do not ignore it.
        </p>
      </div>
    `;

    await this.sendEmail({
      to: apiKey.userEmail,
      subject: `⚠️ Your API Account Will Become Dormant in ${daysUntilDormant} Days`,
      html,
      emailType: 'inactivity_warning',
      apiKeyId: apiKey.id,
      metadata: { daysUntilDormant },
    });
  }

  /**
   * Send balance low warning
   */
  async sendBalanceLowWarning(apiKey: any): Promise<void> {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>💰 Low Balance Warning</h2>
        
        <p>Hi${apiKey.userEmail ? ` ${apiKey.userEmail}` : ''},</p>
        
        <p>Your API key balance is running low:</p>
        
        <div style="background: #fff3cd; border: 1px solid #ffc107; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <strong>Current balance:</strong> ${apiKey.balance} credits<br>
          <strong>Estimated:</strong> ~${apiKey.balance} more requests
        </div>
        
        <p>To avoid service interruption, please top up your account.</p>
        
        <div style="margin: 30px 0;">
          <a href="${this.config.get('app.dashboardUrl')}/billing" 
             style="background: #28a745; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
            Add Credits
          </a>
        </div>
      </div>
    `;

    await this.sendEmail({
      to: apiKey.userEmail,
      subject: '💰 Your API Balance is Low',
      html,
      emailType: 'balance_low',
      apiKeyId: apiKey.id,
    });
  }

  /**
   * Send welcome email
   */
  async sendWelcomeEmail(apiKey: any): Promise<void> {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>🕌 Welcome to Mumin Hadith API!</h2>
        
        <p>Hi${apiKey.userEmail ? ` ${apiKey.userEmail}` : ''},</p>
        
        <p>Your API key has been created successfully. You've received <strong>100 free credits</strong> to get started!</p>
        
        <div style="background: #d4edda; border: 1px solid #28a745; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <strong>Your API Key:</strong> ${apiKey.keyPrefix}...<br>
          <strong>Balance:</strong> ${apiKey.balance} credits
        </div>
        
        <h3>Quick Start:</h3>
        <pre style="background: #f5f5f5; padding: 15px; border-radius: 5px; overflow-x: auto;">
curl -H "Authorization: Bearer YOUR_API_KEY" \\
  ${this.config.get('app.appUrl')}/v1/hadiths
        </pre>
        
        <h3>Resources:</h3>
        <ul>
          <li><a href="${this.config.get('app.appUrl')}/docs">API Documentation</a></li>
          <li><a href="${this.config.get('app.dashboardUrl')}">Dashboard</a></li>
        </ul>
        
        <p style="color: #666; font-size: 12px; margin-top: 30px;">
          Need help? Reply to this email or check our documentation.
        </p>
      </div>
    `;

    await this.sendEmail({
      to: apiKey.userEmail,
      subject: '🕌 Welcome to Mumin Hadith API',
      html,
      emailType: 'welcome',
      apiKeyId: apiKey.id,
    });
  }
}
