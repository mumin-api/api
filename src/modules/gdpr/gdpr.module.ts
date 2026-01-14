import { Module } from '@nestjs/common';
import { GdprController } from './gdpr.controller';
import { DataExportService } from './data-export.service';
import { DataDeletionService } from './data-deletion.service';
import { ConsentService } from './consent.service';
import { PrismaModule } from '@/prisma/prisma.module';
import { FraudModule } from '../fraud/fraud.module';

@Module({
    imports: [PrismaModule, FraudModule],
    controllers: [GdprController],
    providers: [DataExportService, DataDeletionService, ConsentService],
    exports: [DataExportService, DataDeletionService, ConsentService],
})
export class GdprModule { }
