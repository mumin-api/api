import * as Joi from 'joi';

export const validationSchema = Joi.object({
    // Environment
    NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),

    // Server
    PORT: Joi.number().default(3000),

    // Database
    DATABASE_URL: Joi.string().required(),

    // Redis
    REDIS_URL: Joi.string().required(),

    // Security
    ADMIN_API_KEY: Joi.string().min(32).required(),

    // API
    API_VERSION: Joi.string().default('1.0.0'),
    ALLOWED_ORIGINS: Joi.string().default('*'),

    // Rate Limiting
    RATE_LIMIT_TTL: Joi.number().default(60),
    RATE_LIMIT_MAX: Joi.number().default(100),

    // Email
    EMAIL_PROVIDER: Joi.string().valid('sendgrid', 'resend', 'mailgun', 'ses').default('sendgrid'),
    SENDGRID_API_KEY: Joi.string().optional(),
    RESEND_API_KEY: Joi.string().optional(),
    RESEND_WEBHOOK_SECRET: Joi.string().optional(),
    EMAIL_FROM_ADDRESS: Joi.string().email().required(),
    EMAIL_FROM_NAME: Joi.string().default('Mumin API'),

    // App URLs
    APP_URL: Joi.string().uri().required(),
    DASHBOARD_URL: Joi.string().uri().required(),

    // Legal
    TERMS_VERSION: Joi.string().default('2.0'),
    PRIVACY_POLICY_VERSION: Joi.string().default('1.0'),

    // Data Retention
    LOG_RETENTION_DAYS: Joi.number().default(90),

    // Logging
    LOG_LEVEL: Joi.string().default('info'),
});
