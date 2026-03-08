import { Controller, Get, Param, Query, UseGuards, ParseIntPipe, Sse } from '@nestjs/common';
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

    @Get('semantic-search')
    @ApiOperation({ summary: 'Semantic search hadiths by meaning using vector embeddings' })
    @ApiQuery({ name: 'q', required: true, description: 'Search query' })
    @ApiQuery({ name: 'language', required: false, example: 'ru' })
    @ApiQuery({ name: 'limit', required: false, example: 10 })
    async semanticSearch(
        @Query('q') query: string,
        @Query('language') language?: string,
        @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
    ) {
        return this.hadithsService.semanticSearch(query, language, limit);
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

    @Sse(':id/explain-stream')
    @ApiOperation({ summary: 'Stream AI explanation for a hadith (SSE)' })
    @ApiQuery({ name: 'language', required: false, example: 'ru' })
    explainStream(
        @Param('id', ParseIntPipe) id: number,
        @Query('language') language: string = 'ru',
    ) {
        return this.hadithsService.streamExplanation(id, language);
    }

    @Sse('search-stream')
    @ApiOperation({ summary: 'Progressive search returns hadiths as they are found (SSE)' })
    @ApiQuery({ name: 'q', required: true })
    @ApiQuery({ name: 'language', required: false, example: 'ru' })
    @ApiQuery({ name: 'collection', required: false })
    @ApiQuery({ name: 'grade', required: false })
    searchStream(
        @Query('q') q: string,
        @Query('language') language: string = 'ru',
        @Query('collection') col?: string,
        @Query('grade') grade?: string,
    ) {
        return new (require('rxjs').Observable)((subscriber: any) => {
            (async () => {
                try {
                    for await (const result of this.hadithsService.streamSearch(q, language, col, grade)) {
                        subscriber.next(result);
                    }
                    subscriber.complete();
                } catch (err) {
                    subscriber.error(err);
                }
            })();
        });
    }

    @Get(':id/explain')

    @Get(':id/explain/report') // Using GET/POST interchangeably for simplicity if needed, but following REST
    @ApiOperation({ summary: 'Report an error in AI explanation' })
    async report(
        @Param('id', ParseIntPipe) id: number,
        @Query('message') message: string,
    ) {
        return this.hadithsService.reportExplanation(id, message);
    }
}
