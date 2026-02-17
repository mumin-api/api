import { Module } from '@nestjs/common';
import { HadithsService } from './hadiths.service';
import { HadithsController } from './hadiths.controller';
import { TopicsController } from './topics.controller';
import { PrismaModule } from '@/prisma/prisma.module';
import { FraudModule } from '@/modules/fraud/fraud.module';

@Module({
    imports: [PrismaModule, FraudModule],
    controllers: [HadithsController, TopicsController],
    providers: [HadithsService],
    exports: [HadithsService],
})
export class HadithsModule { }
