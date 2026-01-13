import { Module } from '@nestjs/common';
import { HadithsService } from './hadiths.service';
import { HadithsController } from './hadiths.controller';
import { PrismaModule } from '@/prisma/prisma.module';
import { FraudModule } from '@/modules/fraud/fraud.module';

@Module({
    imports: [PrismaModule, FraudModule],
    controllers: [HadithsController],
    providers: [HadithsService],
    exports: [HadithsService],
})
export class HadithsModule { }
