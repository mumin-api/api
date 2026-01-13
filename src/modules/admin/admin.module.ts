import { Module } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { PrismaModule } from '@/prisma/prisma.module';
import { BillingModule } from '@/modules/billing/billing.module';

@Module({
    imports: [PrismaModule, BillingModule],
    controllers: [AdminController],
    providers: [AdminService],
})
export class AdminModule { }
