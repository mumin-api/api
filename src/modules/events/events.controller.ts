import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PrismaService } from '@/prisma/prisma.service';
import { ApiKeyGuard } from '@/common/guards/api-key.guard';

@ApiTags('events')
@Controller('events')
@UseGuards(ApiKeyGuard)
@ApiBearerAuth('api-key')
export class EventsController {
    constructor(private prisma: PrismaService) { }

    @Get('active')
    @ApiOperation({ summary: 'Get currently active events' })
    async findActive() {
        const now = new Date();
        return this.prisma.appEvent.findMany({
            where: {
                OR: [
                    { isActive: true },
                    {
                        startDate: { lte: now },
                        endDate: { gte: now },
                    }
                ]
            }
        });
    }
}
