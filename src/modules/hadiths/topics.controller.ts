import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PrismaService } from '@/prisma/prisma.service';
import { ApiKeyGuard } from '@/common/guards/api-key.guard';

@ApiTags('topics')
@Controller('topics')
@UseGuards(ApiKeyGuard)
@ApiBearerAuth('api-key')
export class TopicsController {
    constructor(private prisma: PrismaService) { }

    @Get()
    @ApiOperation({ summary: 'Get list of available topics' })
    async findAll() {
        return this.prisma.topic.findMany({
            orderBy: { nameEnglish: 'asc' },
            select: {
                id: true,
                nameEnglish: true,
                nameArabic: true,
                slug: true,
                description: true,
                _count: {
                    select: { hadiths: true }
                }
            }
        });
    }
}
