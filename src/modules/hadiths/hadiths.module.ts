import { Module } from '@nestjs/common';
import { HadithsService } from './hadiths.service';
import { HadithsController } from './hadiths.controller';
import { TopicsController } from './topics.controller';
import { PrismaModule } from '@/prisma/prisma.module';
import { FraudModule } from '@/modules/fraud/fraud.module';
import { RedisModule } from '@/common/redis/redis.module';
import { EmailModule } from '@/modules/email/email.module';
import { ConfigModule } from '@nestjs/config';

@Module({
    imports: [PrismaModule, FraudModule, RedisModule, EmailModule, ConfigModule],
    controllers: [HadithsController, TopicsController],
    providers: [HadithsService],
    exports: [HadithsService],
})
export class HadithsModule { }
