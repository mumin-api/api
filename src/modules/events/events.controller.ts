import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PrismaService } from '@/prisma/prisma.service';
import { ApiKeyGuard } from '@/common/guards/api-key.guard';
import { LRUCache } from 'lru-cache';

@ApiTags('events')
@Controller('events')
@UseGuards(ApiKeyGuard)
@ApiBearerAuth('api-key')
export class EventsController {
    private readonly cache: LRUCache<string, any>;

    constructor(private prisma: PrismaService) {
        this.cache = new LRUCache({
            max: 50,
            ttl: 1000 * 60 * 1, // 1 minute
        });
    }

    @Get('active')
    @ApiOperation({ summary: 'Get currently active events' })
    async findActive() {
        const cacheKey = 'active_events';
        const cached = this.cache.get(cacheKey);
        if (cached) return cached;

        const now = new Date();
        const events = await this.prisma.appEvent.findMany({
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

        this.cache.set(cacheKey, events);
        return events;
    }
}
