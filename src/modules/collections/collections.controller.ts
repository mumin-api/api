import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CollectionsService } from './collections.service';
import { ApiKeyGuard } from '@/common/guards/api-key.guard';

@ApiTags('collections')
@Controller('collections')
@UseGuards(ApiKeyGuard)
@ApiBearerAuth('api-key')
export class CollectionsController {
    constructor(private collectionsService: CollectionsService) { }

    @Get()
    @ApiOperation({ summary: 'Get list of all hadith collections' })
    async findAll() {
        return this.collectionsService.findAll();
    }

    @Get(':slug')
    @ApiOperation({ summary: 'Get details of a specific collection by slug' })
    async findOne(@Param('slug') slug: string) {
        return this.collectionsService.findOne(slug);
    }
}
