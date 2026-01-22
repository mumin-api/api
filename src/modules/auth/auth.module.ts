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

@Module({
    imports: [
        PrismaModule,
        PassportModule,
        JwtModule.register({}),
        EmailModule,
    ],
    providers: [AuthService, JwtStrategy, RtStrategy, VerificationService],
    controllers: [AuthController],
})
export class AuthModule { }
