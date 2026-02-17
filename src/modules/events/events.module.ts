import { Module } from '@nestjs/common';
import { EventsController } from './events.controller';
import { PrismaModule } from '@/prisma/prisma.module';

@Module({
    imports: [PrismaModule],
    controllers: [EventsController],
})
export class EventsModule { }
