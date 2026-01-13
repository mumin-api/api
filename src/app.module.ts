import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';

// Configuration
import appConfig from './config/app.config';
import databaseConfig from './config/database.config';
import redisConfig from './config/redis.config';
import emailConfig from './config/email.config';
import { validationSchema } from './config/validation.schema';

// Core modules
import { PrismaModule } from './prisma/prisma.module';

// Feature modules
import { ApiKeysModule } from './modules/api-keys/api-keys.module';
import { FraudModule } from './modules/fraud/fraud.module';
import { HealthModule } from './modules/health/health.module';
import { EmailModule } from './modules/email/email.module';
import { InactivityModule } from './modules/inactivity/inactivity.module';
import { GdprModule } from './modules/gdpr/gdpr.module';
import { BillingModule } from './modules/billing/billing.module';
import { HadithsModule } from './modules/hadiths/hadiths.module';
import { AdminModule } from './modules/admin/admin.module';

// Middleware
import { LoggerMiddleware } from './common/middleware/logger.middleware';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { DeviceFingerprintMiddleware } from './common/middleware/device-fingerprint.middleware';

// Guards
import { ApiKeyGuard } from './common/guards/api-key.guard';

// Filters
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { PrismaExceptionFilter } from './common/filters/prisma-exception.filter';

// Interceptors
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { TimeoutInterceptor } from './common/interceptors/timeout.interceptor';
import { RequestTrackingInterceptor } from './common/interceptors/request-tracking.interceptor';

// Utilities
import { GeolocationUtil } from './common/utils/geolocation.util';

@Module({
    imports: [
        // Configuration
        ConfigModule.forRoot({
            isGlobal: true,
            load: [appConfig, databaseConfig, redisConfig, emailConfig],
            validationSchema,
        }),

        // Rate limiting
        ThrottlerModule.forRoot([
            {
                ttl: 60000, // 60 seconds
                limit: 100, // 100 requests per minute
            },
        ]),

        // Scheduling (for cron jobs)
        ScheduleModule.forRoot(),

        // Core modules
        PrismaModule,

        // Feature modules
        ApiKeysModule,
        FraudModule,
        HealthModule,
        EmailModule,
        InactivityModule,
        GdprModule,
        BillingModule,
        HadithsModule,
        AdminModule,
    ],
    providers: [
        // Global guard for rate limiting
        {
            provide: APP_GUARD,
            useClass: ThrottlerGuard,
        },

        // Global exception filters
        {
            provide: APP_FILTER,
            useClass: HttpExceptionFilter,
        },
        {
            provide: APP_FILTER,
            useClass: PrismaExceptionFilter,
        },

        // Global interceptors
        {
            provide: APP_INTERCEPTOR,
            useClass: LoggingInterceptor,
        },
        {
            provide: APP_INTERCEPTOR,
            useClass: TimeoutInterceptor,
        },
        {
            provide: APP_INTERCEPTOR,
            useClass: TransformInterceptor,
        },
        {
            provide: APP_INTERCEPTOR,
            useClass: RequestTrackingInterceptor,
        },

        // Utilities
        GeolocationUtil,
    ],
})
export class AppModule implements NestModule {
    configure(consumer: MiddlewareConsumer) {
        consumer
            .apply(RequestIdMiddleware, LoggerMiddleware, DeviceFingerprintMiddleware)
            .forRoutes('*');
    }
}
