import { Injectable, NotFoundException, Inject, Logger } from '@nestjs/common';
import { from, Observable } from 'rxjs';
import { PrismaService } from '@/prisma/prisma.service';
import { GetHadithsDto } from './dto/get-hadiths.dto';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '@/common/redis/redis.module';
import { MeilisearchService } from '@/common/meilisearch/meilisearch.service';
import { AiService } from '@/common/ai/ai.service';
import { VectorService } from '@/common/ai/vector.service';
import { EmailService } from '@/modules/email/email.service';
import { ConfigService } from '@nestjs/config';
import { LRUCache } from 'lru-cache';
import { ArabicStemmer } from '@/common/utils/arabic-stemmer';
import { SingleFlight } from '@/common/utils/single-flight';
import { PartialJsonHelper } from '@/common/utils/partial-json-helper';

@Injectable()
export class HadithsService {
    private readonly logger = new Logger(HadithsService.name);
    private readonly l1Cache: LRUCache<string, any>;
    private readonly singleFlight: SingleFlight;

    constructor(
        private prisma: PrismaService,
        @Inject(REDIS_CLIENT) private redis: Redis,
        private meilisearch: MeilisearchService,
        private aiService: AiService,
        private vectorService: VectorService,
        private emailService: EmailService,
        private config: ConfigService,
    ) { 
        this.l1Cache = new LRUCache({
            max: 500,
            ttl: 1000 * 60 * 5,
        });
        this.singleFlight = new SingleFlight();
    }

    async getExplanation(id: number, language: string = 'en') {
        const flightKey = `explanation:${id}:${language}`;
        return this.singleFlight.do(flightKey, async () => {
            const cache = await (this.prisma as any).hadithExplanation.findUnique({
                where: {
                    hadithId_languageCode: {
                        hadithId: id,
                        languageCode: language,
                    },
                },
            });

            if (cache) return cache;

            const hadith = await this.prisma.hadith.findUnique({
                where: { id },
                include: { collectionRef: true },
            });

            if (!hadith) throw new NotFoundException(`Hadith with ID ${id} not found`);

            const collectionName = hadith.collectionRef?.nameEnglish || hadith.collection;
            
            const result = await this.aiService.generateExplanation(
                hadith.arabicText,
                hadith.id,
                collectionName,
                language,
            );

            return (this.prisma as any).hadithExplanation.create({
                data: {
                    hadithId: id,
                    languageCode: language,
                    content: {
                        short_meaning: result.short_meaning,
                        long_meaning: result.long_meaning,
                        context: result.context,
                        legal_note: result.legal_note,
                        benefit: result.benefit,
                        certainty_level: result.certainty_level,
                        notes: result.notes,
                    },
                    provider: result.provider,
                    model: result.model,
                },
            });
        });
    }

    async streamExplanation(id: number, language: string = 'en') {
        const cache = await (this.prisma as any).hadithExplanation.findUnique({
            where: {
                hadithId_languageCode: {
                    hadithId: id,
                    languageCode: language,
                },
            },
        });

        if (cache) {
            return new Observable<any>((subscriber) => {
                subscriber.next({ data: JSON.stringify(cache) });
                subscriber.next({ data: '[DONE]' });
                subscriber.complete();
            });
        }

        const hadith = await this.prisma.hadith.findUnique({
            where: { id },
            include: { collectionRef: true },
        });

        if (!hadith) throw new NotFoundException(`Hadith with ID ${id} not found`);

        const collectionName = hadith.collectionRef?.nameEnglish || hadith.collection;
        const stream = await this.aiService.streamExplanation(
            hadith.arabicText,
            collectionName,
            language,
        );

        return new Observable<any>((subscriber) => {
            const reader = stream.getReader();
            let accumulated = '';
            let isCancelled = false;

            const read = async () => {
                try {
                    const { done, value } = await reader.read();
                    if (isCancelled) return;
                    if (done) {
                        subscriber.next({ data: '[DONE]' });
                        subscriber.complete();
                        return;
                    }
                    const chunkStr = new TextDecoder().decode(value);
                    accumulated += chunkStr;

                    const repaired = PartialJsonHelper.repair(accumulated);
                    subscriber.next({ data: JSON.stringify({ content: repaired }) });
                    
                    read();
                } catch (err) {
                    if (!isCancelled) subscriber.error(err);
                }
            };
            
            read();

            return () => {
                isCancelled = true;
                reader.cancel().catch(() => {});
            };
        });
    }

    async reportExplanation(id: number, message: string, userId?: number) {
        const explanation = await (this.prisma as any).hadithExplanation.findFirst({
            where: { hadithId: id },
        });

        if (!explanation) throw new NotFoundException(`Explanation for hadith ${id} not found`);

        const feedback = await (this.prisma as any).explanationFeedback.create({
            data: {
                explanationId: explanation.id,
                message: message,
                userId: userId || null,
            },
        });

        const adminEmail = this.config.get('email.adminEmail');
        if (adminEmail) {
            this.emailService.sendEmail({
                to: adminEmail,
                subject: `⚠️ Hadith Explanation Reported (#${id})`,
                html: `<h3>AI Explanation Report</h3><p><strong>Hadith ID:</strong> ${id}</p><p><strong>Message:</strong> ${message}</p>`,
                emailType: 'admin_report',
                apiKeyId: 1,
                userId: userId || 1,
            }).catch(err => console.error('Failed to send admin report email:', err));
        }

        return feedback;
    }

    private mapHadithResponse(hadith: any) {
        return {
            id: hadith.id,
            collection: hadith.collectionRef?.nameEnglish || hadith.collection,
            collectionId: hadith.collectionId,
            bookNumber: hadith.bookNumber,
            hadithNumber: hadith.hadithNumber,
            arabicText: hadith.arabicText,
            arabicNarrator: hadith.arabicNarrator,
            translation: hadith.translations?.[0] || null,
        };
    }

    async findAll(dto: GetHadithsDto) {
        const { page = 1, limit = 20, collection, bookNumber, hadithNumber, language = 'en', grade, topic } = dto;
        const skip = (page - 1) * limit;

        const where: any = {};
        if (collection) {
            where.OR = [{ collection: collection }, { collectionRef: { slug: collection } }];
        }
        if (bookNumber) where.bookNumber = bookNumber;
        if (hadithNumber) where.hadithNumber = hadithNumber;
        if (grade) {
            where.translations = { some: { grade, languageCode: language } };
        }
        if (topic) {
            where.topics = { some: { topic: { slug: topic } } };
        }

        const [hadiths, total] = await Promise.all([
            this.prisma.hadith.findMany({
                where,
                skip,
                take: limit,
                include: {
                    translations: { where: { languageCode: language } },
                    collectionRef: true,
                },
                orderBy: [{ bookNumber: 'asc' }, { hadithNumber: 'asc' }],
            }),
            this.prisma.hadith.count({ where }),
        ]);

        const totalPages = Math.ceil(total / limit);

        return {
            data: hadiths.map(h => this.mapHadithResponse(h)),
            pagination: { page, limit, total, totalPages, hasNext: page < totalPages, hasPrev: page > 1 },
        };
    }

    async findOne(id: number, language: string = 'en') {
        const hadith = await this.prisma.hadith.findUnique({
            where: { id },
            include: {
                translations: { where: { languageCode: language } },
                collectionRef: true,
            },
        });

        if (!hadith) throw new NotFoundException(`Hadith with ID ${id} not found`);
        return this.mapHadithResponse(hadith);
    }

    async semanticSearch(query: string, language: string = 'ru', limit: number = 10) {
    console.log(`[SemanticSearch] START: "${query}" (lang: ${language}, limit: ${limit})`);
    if (!query) return { data: [], total: 0 };
    
    // Incrementing version to v5 to bypass any stale results
    const cacheKey = `semantic:v5:${query.trim().toLowerCase().substring(0, 100)}:${language}:${limit}`;

    const l1Hit = this.l1Cache.get(cacheKey);
    if (l1Hit) {
        console.log(`[SemanticSearch] L1 CACHE HIT for query: "${query}"`);
        return l1Hit;
    }

    try {
        const cached = await this.redis.get(cacheKey);
        if (cached) {
            console.log(`[SemanticSearch] REDIS CACHE HIT for query: "${query}"`);
            const result = JSON.parse(cached);
            this.l1Cache.set(cacheKey, result);
            return result;
        }
    } catch (e: any) {
        console.error(`[SemanticSearch] Redis Error: ${e.message}`);
    }

    console.log(`[SemanticSearch] CACHE MISS. Fetching from Pinecone...`);
        return this.singleFlight.do(cacheKey, async () => {
            const queryVector = await this.aiService.generateEmbedding(query);
            const matches = await this.vectorService.search(queryVector, limit);
            
            console.log(`[SemanticSearch] Query: "${query}", Vector Length: ${queryVector.length}, Matches: ${matches.length}`);
            
            if (matches.length === 0) {
                console.log('[SemanticSearch] No matches from VectorService');
                return { data: [], total: 0 };
            }

            const hadithIds = matches.map(m => m.id);
            console.log(`[SemanticSearch] Hadith IDs from Pinecone: ${hadithIds.join(', ')}`);

            const hadiths = await this.prisma.hadith.findMany({
                where: { id: { in: hadithIds } },
                include: {
                    translations: { where: { languageCode: language } },
                    collectionRef: true,
                }
            });

            console.log(`[SemanticSearch] Found ${hadiths.length} hadiths in DB for these IDs`);

            const results = hadithIds.map(id => {
                const h = hadiths.find(item => item.id === id);
                if (!h) return null;
                const match = matches.find(m => m.id === id);
                return {
                    ...this.mapHadithResponse(h),
                    similarity: match?.score || 0
                };
            }).filter(Boolean);

            const finalResult = { data: results, total: results.length };
            try {
                await this.redis.set(cacheKey, JSON.stringify(finalResult), 'EX', 3600);
            } catch (e) {}

            return finalResult;
        });
    }

    async findRandom(params: { language?: string; collection?: string; grade?: string } = {}) {
        const { language = 'en', collection, grade } = params;
        const where: any = {};
        if (collection) {
            where.OR = [{ collection }, { collectionRef: { slug: collection } }];
        }
        if (grade) {
            where.translations = { some: { grade, languageCode: language } };
        }

        const count = await this.prisma.hadith.count({ where });
        if (count === 0) return null;

        const skip = Math.floor(Math.random() * count);
        const hadith = await this.prisma.hadith.findFirst({
            where,
            skip,
            include: {
                translations: { where: { languageCode: language } },
                collectionRef: true,
            },
        });

        if (!hadith) throw new NotFoundException('No hadiths found');
        return this.mapHadithResponse(hadith);
    }

    async findDaily(language: string = 'en') {
        const count = await this.prisma.hadith.count();
        if (count === 0) return null;

        const dayOfYear = Math.floor((new Date().getTime() - new Date(new Date().getFullYear(), 0, 0).getTime()) / (1000 * 60 * 60 * 24));
        const skip = dayOfYear % count;

        const hadith = await this.prisma.hadith.findFirst({
            skip,
            include: {
                translations: { where: { languageCode: language } },
                collectionRef: true,
            },
            orderBy: { id: 'asc' },
        });

        return hadith ? this.mapHadithResponse(hadith) : null;
    }

    private normalizeArabic(text: string): string {
        if (!text) return '';
        return text.replace(/\u0640/g, '').replace(/[\u064B-\u065F\u0670]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/[،؛؟«»"'.]/g, ' ').replace(/\s+/g, ' ').trim();
    }

    async *streamSearch(query: string, language: string = 'en', collection?: string, grade?: string) {
        const trimmed = (query || '').trim();
        if (!trimmed) return;

        const normalizedQuery = this.normalizeArabic(trimmed);
        const limit = 50;

        try {
            const filter: string[] = [];
            if (collection) filter.push(`collection = "${collection}"`);
            if (grade) filter.push(`grade = "${grade}"`);
            if (language) filter.push(`languageCode = "${language}"`);

            const meiliResults = await this.meilisearch.search(normalizedQuery, {
                filter: filter.length > 0 ? filter.join(' AND ') : undefined,
                limit: limit,
            });

            if (meiliResults.hits && meiliResults.hits.length > 0) {
                for (const hit of meiliResults.hits) {
                    yield {
                        data: JSON.stringify({
                            id: hit.id,
                            collection: hit.collection,
                            bookNumber: hit.bookNumber,
                            hadithNumber: hit.hadithNumber,
                            arabicText: hit.arabicText,
                            translation: {
                                text: hit.translations ? (hit.translations[0]?.text || '') : (hit.text || ''),
                                grade: hit.grade,
                                languageCode: language,
                            },
                        }),
                    };
                }
                return;
            }
        } catch (e: any) {
            this.logger.warn(`Meilisearch stream fallback: ${e.message}`);
        }

        const isArabic = /[\u0600-\u06FF]/.test(normalizedQuery);
        const stemmedQuery = isArabic ? ArabicStemmer.stemSentence(normalizedQuery) : normalizedQuery;
        const likeQuery = `%${normalizedQuery}%`;
        const likeStemmedQuery = `%${stemmedQuery}%`;

        const resultsRaw: any[] = await this.prisma.$queryRawUnsafe(`
            SELECT id, collection_name, book_number, hadith_number, arabic_text, translation_text, grade
            FROM search_view
            WHERE (normalized_arabic ILIKE '${likeQuery}' OR normalized_arabic ILIKE '${likeStemmedQuery}' OR translation_text ILIKE '${likeQuery}')
            AND language_code = '${language}'
            ${collection ? `AND (collection_slug = '${collection}' OR collection_name = '${collection}')` : ''}
            ${grade ? `AND grade = '${grade}'` : ''}
            ORDER BY book_number ASC, hadith_number ASC
            LIMIT ${limit}
        `);

        for (const row of resultsRaw) {
            yield {
                data: JSON.stringify({
                    id: row.id,
                    collection: row.collection_name,
                    bookNumber: row.book_number,
                    hadithNumber: row.hadith_number,
                    arabicText: row.arabic_text,
                    translation: { text: row.translation_text, grade: row.grade, languageCode: language },
                }),
            };
        }

        yield { data: '[DONE]' };
    }

    async search(query: string = '', language: string = 'en', page: number = 1, limit: number = 20, collection?: string, grade?: string) {
        const trimmed = (query || '').trim();
        if (!trimmed) return { data: [], pagination: { page, limit, total: 0, totalPages: 0, hasNext: false, hasPrev: false } };

        const normalizedQuery = this.normalizeArabic(trimmed);
        const cacheKey = `search:v6:${normalizedQuery.substring(0, 50)}:${language}:${page}:${limit}:${collection || 'none'}:${grade || 'none'}`;
        
        const l1 = this.l1Cache.get(cacheKey);
        if (l1) return l1;

        try {
            const cached = await this.redis.get(cacheKey);
            if (cached) {
                const results = JSON.parse(cached);
                this.l1Cache.set(cacheKey, results);
                return results;
            }
        } catch (e) {}

        const numericMatch = trimmed.match(/^\d+$/);
        if (numericMatch) {
            const results = await this.searchWithNumberPriority(parseInt(trimmed, 10), trimmed, language, page, limit, collection, grade);
            if (results.data.length > 0) await this.cacheResults(cacheKey, results);
            return results;
        }

        const filter: string[] = [];
        if (collection) filter.push(`collection = "${collection}"`);
        if (grade) filter.push(`grade = "${grade}"`);
        if (language) filter.push(`languageCode = "${language}"`);

        let meiliResults: any = { hits: [], totalHits: 0 };
        try {
            meiliResults = await this.meilisearch.search(normalizedQuery, {
                filter: filter.length > 0 ? filter.join(' AND ') : undefined,
                offset: (page - 1) * limit,
                limit: limit,
            });
        } catch (e) {}

        if (meiliResults.hits && meiliResults.hits.length > 0) {
            const results = this.formatSearchResponse(meiliResults, page, limit);
            await this.cacheResults(cacheKey, results);
            return results;
        }

        const skip = (page - 1) * limit;
        const resultsRaw: any[] = await this.prisma.$queryRawUnsafe(`
            SELECT h.id, COUNT(*) OVER() as full_count FROM hadiths h
            LEFT JOIN translations t ON t.hadith_id = h.id AND t.language_code = '${language}'
            WHERE (h.normalized_arabic ILIKE '%${normalizedQuery}%' OR t.text ILIKE '%${normalizedQuery}%')
            ${collection ? `AND (h.collection = '${collection}' OR h.collection_id IN (SELECT id FROM collections WHERE slug = '${collection}'))` : ''}
            ${grade ? `AND t.grade = '${grade}'` : ''}
            ORDER BY h.book_number ASC, h.hadith_number ASC
            LIMIT ${limit} OFFSET ${skip}
        `);

        const total = resultsRaw.length > 0 ? Number(resultsRaw[0].full_count) : 0;
        const hadiths = resultsRaw.length > 0 ? await this.prisma.hadith.findMany({
            where: { id: { in: resultsRaw.map(r => r.id) } },
            include: { translations: { where: { languageCode: language } }, collectionRef: true },
            orderBy: [{ bookNumber: 'asc' }, { hadithNumber: 'asc' }],
        }) : [];

        const results = {
            data: hadiths.map(h => this.mapHadithResponse(h)),
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit), hasNext: page < Math.ceil(total / limit), hasPrev: page > 1 },
        };

        if (results.data.length > 0) await this.cacheResults(cacheKey, results);
        return results;
    }

    private formatSearchResponse(meiliResults: any, page: number, limit: number) {
        return {
            data: meiliResults.hits.map((hit: any) => ({
                id: hit.id,
                collection: hit.collection,
                bookNumber: hit.bookNumber,
                hadithNumber: hit.hadithNumber,
                arabicText: hit.arabicText,
                translation: { text: hit.translations ? (hit.translations[0]?.text || '') : (hit.text || ''), grade: hit.grade, languageCode: hit.languageCode }
            })),
            pagination: {
                page,
                limit,
                total: meiliResults.totalHits || meiliResults.estimatedTotalHits || 0,
                totalPages: Math.ceil((meiliResults.totalHits || meiliResults.estimatedTotalHits || 0) / limit),
                hasNext: page < Math.ceil((meiliResults.totalHits || meiliResults.estimatedTotalHits || 0) / limit),
                hasPrev: page > 1,
            },
        };
    }

    private async cacheResults(key: string, results: any) {
        try {
            await this.redis.set(key, JSON.stringify(results), 'EX', 3600);
            this.l1Cache.set(key, results);
        } catch (e) {}
    }

    async getSuggestions(query: string, language: string = 'en') { return []; }
    async spellSuggest(query: string, language: string = 'en') { return []; }

    private async searchWithNumberPriority(hadithNumber: number, query: string, language: string, page: number, limit: number, collection?: string, grade?: string) {
        const offset = (page - 1) * limit;
        const results: any[] = await this.prisma.$queryRawUnsafe(`
            WITH scored_results AS (
                SELECT id, 100 as score FROM hadiths WHERE hadith_number = ${hadithNumber} ${collection ? `AND (collection = '${collection}' OR collection_id IN (SELECT id FROM collections WHERE slug = '${collection}'))` : ''}
                UNION ALL
                SELECT id, 50 as score FROM hadiths WHERE CAST(hadith_number AS TEXT) LIKE '%${query}%' AND hadith_number != ${hadithNumber} ${collection ? `AND (collection = '${collection}' OR collection_id IN (SELECT id FROM collections WHERE slug = '${collection}'))` : ''}
                UNION ALL
                SELECT h.id, 30 as score FROM hadiths h LEFT JOIN translations t ON t.hadith_id = h.id AND t.language_code = '${language}'
                WHERE (h.normalized_arabic ILIKE '%${query}%' OR t.text ILIKE '%${query}%') AND h.hadith_number != ${hadithNumber} ${collection ? `AND (h.collection = '${collection}' OR h.collection_id IN (SELECT id FROM collections WHERE slug = '${collection}'))` : ''} ${grade ? `AND t.grade = '${grade}'` : ''}
            )
            SELECT DISTINCT ON (id) * FROM (SELECT id, MAX(score) as max_score FROM scored_results GROUP BY id) s
            ORDER BY max_score DESC, id ASC LIMIT ${limit} OFFSET ${offset}
        `);
        const totalRaw: any[] = await this.prisma.$queryRawUnsafe(`SELECT COUNT(DISTINCT id) as total FROM (SELECT id FROM hadiths WHERE hadith_number = ${hadithNumber} UNION SELECT id FROM hadiths WHERE CAST(hadith_number AS TEXT) LIKE '%${query}%' UNION SELECT h.id FROM hadiths h LEFT JOIN translations t ON t.hadith_id = h.id AND t.language_code = '${language}' WHERE (h.normalized_arabic ILIKE '%${query}%' OR t.text ILIKE '%${query}%')) s`);
        const total = Number(totalRaw[0].total);
        const ids = results.map(r => r.id);
        const hadiths = ids.length > 0 ? await this.prisma.hadith.findMany({ where: { id: { in: ids } }, include: { translations: { where: { languageCode: language } }, collectionRef: true } }) : [];
        const ordered = ids.map(id => hadiths.find(h => h.id === id)).filter(Boolean);
        return { data: ordered.map(h => this.mapHadithResponse(h as any)), pagination: { page, limit, total, totalPages: Math.ceil(total / limit), hasNext: page < Math.ceil(total / limit), hasPrev: page > 1 } };
    }
}
