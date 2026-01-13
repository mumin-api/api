import { Module } from '@nestjs/common';
import { InactivityCronService } from './inactivity-cron.service';
import { PrismaModule } from '@/prisma/prisma.module';
import { EmailModule } from '@/modules/email/email.module';

@Module({
    imports: [PrismaModule, EmailModule],
    providers: [InactivityCronService],
})
export class InactivityModule { }
