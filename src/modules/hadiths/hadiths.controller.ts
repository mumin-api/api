import { Controller, Get, Param, Query, UseGuards, ParseIntPipe, Sse, Res } from '@nestjs/common';
import { FastifyReply } from 'fastify';
import { Observable, from } from 'rxjs';
import { map } from 'rxjs/operators';
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


    @Get('search-stream')
    @ApiOperation({ summary: 'Progressive search returns hadiths as they are found (SSE)' })
    @ApiQuery({ name: 'q', required: true })
    @ApiQuery({ name: 'language', required: false, example: 'ru' })
    @ApiQuery({ name: 'collection', required: false })
    @ApiQuery({ name: 'grade', required: false })
    async searchStream(
        @Query('q') q: string,
        @Res() res: FastifyReply,
        @Query('language') language: string = 'ru',
        @Query('col') col?: string,
        @Query('grade') grade?: string,
    ) {
        res.raw.setHeader('Content-Type', 'text/event-stream');
        res.raw.setHeader('Cache-Control', 'no-cache');
        res.raw.setHeader('Connection', 'keep-alive');
        res.raw.flushHeaders();

        const stream$ = from(this.hadithsService.streamSearch(q, language, col, grade));

        const subscription = stream$.subscribe({
            next: (data: any) => {
                res.raw.write(`data: ${data.data}\n\n`);
            },
            error: (err) => {
                console.error(`[SSE Error] Search for "${q}":`, err);
                res.raw.end();
            },
            complete: () => {
                res.raw.end();
            }
        });

        res.raw.on('close', () => {
            subscription.unsubscribe();
        });
    }

    @Get(':id/explain-stream')
    @ApiOperation({ summary: 'Stream AI explanation for a hadith (SSE)' })
    @ApiQuery({ name: 'language', required: false, example: 'ru' })
    async explainStream(
        @Param('id', ParseIntPipe) id: number,
        @Res() res: FastifyReply,
        @Query('language') language: string = 'ru',
    ) {
        res.raw.setHeader('Content-Type', 'text/event-stream');
        res.raw.setHeader('Cache-Control', 'no-cache');
        res.raw.setHeader('Connection', 'keep-alive');
        // Fastify specific: prevents the response from ending immediately
        res.raw.flushHeaders();

        const stream$ = await this.hadithsService.streamExplanation(id, language);

        const subscription = stream$.subscribe({
            next: (data: any) => {
                res.raw.write(`data: ${data.data}\n\n`);
            },
            error: (err: any) => {
                console.error(`[SSE Error] Hadith ${id}:`, err);
                // Can't write SSE error properly if it's already streaming, but we close it
                res.raw.end();
            },
            complete: () => {
                res.raw.end();
            }
        });

        // Cleanup on connection close
        res.raw.on('close', () => {
            subscription.unsubscribe();
        });
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
