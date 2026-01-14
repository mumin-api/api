import { Module, Global } from '@nestjs/common';
import { FraudDetectionService } from './fraud-detection.service';
import { PrismaModule } from '@/prisma/prisma.module';

@Global()
@Module({
    imports: [PrismaModule],
    providers: [FraudDetectionService],
    exports: [FraudDetectionService],
})
export class FraudModule { }
