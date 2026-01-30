import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { PrismaModule } from '@/prisma/prisma.module';
import { JwtStrategy } from './strategies/jwt.strategy';
import { RtStrategy } from './strategies/rt.strategy';
import { VerificationService } from './verification.service';
import { EmailModule } from '../email/email.module';
import { ApiKeysModule } from '../api-keys/api-keys.module';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Module({
    imports: [
        PrismaModule,
        PassportModule,
        JwtModule.register({}),
        EmailModule,
        ApiKeysModule,
    ],
    providers: [
        AuthService, 
        JwtStrategy, 
        RtStrategy, 
        VerificationService,
        {
            provide: 'REDIS_CLIENT',
            useFactory: (config: ConfigService) => {
                return new Redis(config.get<string>('redis.url') || process.env.REDIS_URL || 'redis://localhost:6379');
            },
            inject: [ConfigService],
        }
    ],
    controllers: [AuthController],
})
export class AuthModule { }
