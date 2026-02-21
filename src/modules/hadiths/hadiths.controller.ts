import { Controller, Get, Param, Query, UseGuards, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { HadithsService } from './hadiths.service';
import { GetHadithsDto } from './dto/get-hadiths.dto';
import { ApiKeyGuard } from '@/common/guards/api-key.guard';

@ApiTags('hadiths')
@Controller('hadiths')
@UseGuards(ApiKeyGuard)
@ApiBearerAuth('api-key')
export class HadithsController {
    constructor(private hadithsService: HadithsService) { }

    @Get()
    @ApiOperation({ summary: 'Get list of hadiths with pagination and filtering' })
    async findAll(@Query() dto: GetHadithsDto) {
        return this.hadithsService.findAll(dto);
    }

    @Get('random')
    @ApiOperation({ summary: 'Get a random hadith' })
    @ApiQuery({ name: 'language', required: false, example: 'en' })
    @ApiQuery({ name: 'collection', required: false })
    @ApiQuery({ name: 'grade', required: false })
    async findRandom(
        @Query('language') language?: string,
        @Query('collection') collection?: string,
        @Query('grade') grade?: string,
    ) {
        return this.hadithsService.findRandom({ language, collection, grade });
    }

    @Get('daily')
    @ApiOperation({ summary: 'Get the daily featured hadith' })
    @ApiQuery({ name: 'language', required: false, example: 'en' })
    async findDaily(@Query('language') language?: string) {
        return this.hadithsService.findDaily(language);
    }

    @Get('search')
    @ApiOperation({ summary: 'Search hadiths by text' })
    @ApiQuery({ name: 'q', required: true, description: 'Search query' })
    @ApiQuery({ name: 'language', required: false, example: 'en' })
    @ApiQuery({ name: 'page', required: false, example: 1 })
    @ApiQuery({ name: 'limit', required: false, example: 20 })
    @ApiQuery({ name: 'collection', required: false })
    @ApiQuery({ name: 'grade', required: false })
    async search(
        @Query('q') query: string,
        @Query('language') language?: string,
        @Query('page', new ParseIntPipe({ optional: true })) page?: number,
        @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
        @Query('collection') collection?: string,
        @Query('grade') grade?: string,
    ) {
        return this.hadithsService.search(query, language, page, limit, collection, grade);
    }

    @Get('suggestions')
    @ApiOperation({ summary: 'Get search suggestions based on topics' })
    @ApiQuery({ name: 'q', required: true, description: 'Search query' })
    @ApiQuery({ name: 'language', required: false, example: 'en' })
    async getSuggestions(
        @Query('q') query: string,
        @Query('language') language?: string,
    ) {
        return this.hadithsService.getSuggestions(query, language);
    }

    @Get('spell')
    @ApiOperation({ summary: 'Spell suggestion: find similar real words from hadith corpus' })
    @ApiQuery({ name: 'q', required: true, description: 'Misspelled query' })
    @ApiQuery({ name: 'language', required: false, example: 'ru' })
    async spellSuggest(
        @Query('q') query: string,
        @Query('language') language?: string,
    ) {
        return this.hadithsService.spellSuggest(query, language);
    }


    @Get(':id')
    @ApiOperation({ summary: 'Get hadith by ID' })
    @ApiQuery({ name: 'language', required: false, example: 'en' })
    async findOne(
        @Param('id', ParseIntPipe) id: number,
        @Query('language') language?: string,
    ) {
        return this.hadithsService.findOne(id, language);
    }
}
