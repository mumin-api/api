import { Module, Global } from '@nestjs/common';
import { FraudDetectionService } from './fraud-detection.service';
import { PrismaModule } from '@/prisma/prisma.module';
import { RedisModule } from '@/common/redis/redis.module';

@Global()
@Module({
    imports: [PrismaModule, RedisModule],
    providers: [FraudDetectionService],
    exports: [FraudDetectionService],
})
export class FraudModule { }
