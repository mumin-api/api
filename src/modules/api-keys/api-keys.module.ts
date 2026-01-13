import { Module } from '@nestjs/common';
import { ApiKeysService } from './api-keys.service';
import { ApiKeysController } from './api-keys.controller';
import { PrismaModule } from '@/prisma/prisma.module';
import { GeolocationUtil } from '@/common/utils/geolocation.util';
import { FraudModule } from '@/modules/fraud/fraud.module';
import { EmailModule } from '@/modules/email/email.module';

@Module({
    imports: [PrismaModule, FraudModule, EmailModule],
    controllers: [ApiKeysController],
    providers: [ApiKeysService, GeolocationUtil],
    exports: [ApiKeysService],
})
export class ApiKeysModule { }
