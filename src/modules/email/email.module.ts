import { Module, Global } from '@nestjs/common';
import { EmailService } from './email.service';
import { EmailController } from './email.controller';
import { PrismaModule } from '@/prisma/prisma.module';

@Global()
@Module({
    imports: [PrismaModule],
    controllers: [EmailController],
    providers: [EmailService],
    exports: [EmailService],
})
export class EmailModule { }
