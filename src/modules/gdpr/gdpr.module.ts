import { Module } from '@nestjs/common';
import { GdprController } from './gdpr.controller';
import { DataExportService } from './data-export.service';
import { DataDeletionService } from './data-deletion.service';
import { ConsentService } from './consent.service';
import { PrismaModule } from '@/prisma/prisma.module';

@Module({
    imports: [PrismaModule],
    controllers: [GdprController],
    providers: [DataExportService, DataDeletionService, ConsentService],
    exports: [DataExportService, DataDeletionService, ConsentService],
})
export class GdprModule { }
