import { Injectable, NotFoundException, Inject } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { GetHadithsDto } from './dto/get-hadiths.dto';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '@/common/redis/redis.module';
import { MeilisearchService } from '@/common/meilisearch/meilisearch.service';
import { AiService } from '@/common/ai/ai.service';
import { EmailService } from '@/modules/email/email.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class HadithsService {
    constructor(
        private prisma: PrismaService,
        @Inject(REDIS_CLIENT) private redis: Redis,
        private meilisearch: MeilisearchService,
        private aiService: AiService,
        private emailService: EmailService,
        private config: ConfigService,
    ) { 
        // Logic moved to MeilisearchService onModuleInit
    }

    async getExplanation(id: number, language: string = 'en') {
        // 1. Check cache
        const cache = await (this.prisma as any).hadithExplanation.findUnique({
            where: {
                hadithId_languageCode: {
                    hadithId: id,
                    languageCode: language,
                },
            },
        });

        if (cache) {
            return cache;
        }

        // 2. Not in cache, get hadith text
        const hadith = await this.prisma.hadith.findUnique({
            where: { id },
            include: { collectionRef: true },
        });

        if (!hadith) {
            throw new NotFoundException(`Hadith with ID ${id} not found`);
        }

        const collectionName = hadith.collectionRef?.nameEnglish || hadith.collection;
        
        // 3. Generate explanation
        const result = await this.aiService.generateExplanation(
            hadith.arabicText,
            hadith.id,
            collectionName,
            language,
        );

        // 4. Save to cache
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
    }

    async reportExplanation(id: number, message: string, userId?: number) {
        // Find existing explanation
        const explanation = await (this.prisma as any).hadithExplanation.findFirst({
            where: { hadithId: id },
        });

        if (!explanation) {
            throw new NotFoundException(`Explanation for hadith ${id} not found`);
        }

        const feedback = await (this.prisma as any).explanationFeedback.create({
            data: {
                explanationId: explanation.id,
                message: message,
                userId: userId || null,
            },
        });

        // Send admin notification
        const adminEmail = this.config.get('email.adminEmail');
        if (adminEmail) {
            this.emailService.sendEmail({
                to: adminEmail,
                subject: `⚠️ Hadith Explanation Reported (#${id})`,
                html: `
                    <h3>AI Explanation Report</h3>
                    <p><strong>Hadith ID:</strong> ${id}</p>
                    <p><strong>Explanation ID:</strong> ${explanation.id}</p>
                    <p><strong>Message:</strong> ${message}</p>
                    <p><strong>User ID:</strong> ${userId || 'Anonymous'}</p>
                    <hr>
                    <p>Please review the explanation in the database.</p>
                `,
                emailType: 'admin_report',
                apiKeyId: 1, // System-level (placeholder for system logs)
                userId: userId || 1, // System-level
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
            metadata: hadith.metadata,
        };
    }

    async findAll(dto: GetHadithsDto) {
        const { page = 1, limit = 20, collection, bookNumber, hadithNumber, language = 'en', grade, topic } = dto;
        const skip = (page - 1) * limit;

        const where: any = {};

        if (collection) {
            where.OR = [
                { collection: collection },
                { collectionRef: { slug: collection } }
            ];
        }

        if (bookNumber) where.bookNumber = bookNumber;
        if (hadithNumber) where.hadithNumber = hadithNumber;

        if (grade) {
            where.translations = {
                some: {
                    grade,
                    languageCode: language,
                },
            };
        }

        if (topic) {
            where.topics = {
                some: {
                    topic: {
                        slug: topic,
                    },
                },
            };
        }

        const [hadiths, total] = await Promise.all([
            this.prisma.hadith.findMany({
                where,
                skip,
                take: limit,
                include: {
                    translations: {
                        where: { languageCode: language },
                    },
                    collectionRef: true,
                },
                orderBy: [{ bookNumber: 'asc' }, { hadithNumber: 'asc' }],
            }),
            this.prisma.hadith.count({ where }),
        ]);

        const totalPages = Math.ceil(total / limit);

        return {
            data: hadiths.map(h => this.mapHadithResponse(h)),
            pagination: {
                page,
                limit,
                total,
                totalPages,
                hasNext: page < totalPages,
                hasPrev: page > 1,
            },
        };
    }

    async findOne(id: number, language: string = 'en') {
        const hadith = await this.prisma.hadith.findUnique({
            where: { id },
            include: {
                translations: {
                    where: { languageCode: language },
                },
                collectionRef: true,
            },
        });

        if (!hadith) {
            throw new NotFoundException(`Hadith with ID ${id} not found`);
        }

        return this.mapHadithResponse(hadith);
    }

    async findRandom(params: { language?: string; collection?: string; grade?: string } = {}) {
        const { language = 'en', collection, grade } = params;

        const where: any = {};
        if (collection) {
            where.OR = [
                { collection: collection },
                { collectionRef: { slug: collection } }
            ];
        }
        if (grade) {
            where.translations = {
                some: {
                    grade,
                    languageCode: language,
                },
            };
        }

        const count = await this.prisma.hadith.count({ where });
        if (count === 0) {
            return null;
        }

        const skip = Math.floor(Math.random() * count);

        const hadith = await this.prisma.hadith.findFirst({
            where,
            skip,
            include: {
                translations: {
                    where: { languageCode: language },
                },
                collectionRef: true,
            },
        });

        if (!hadith) {
            throw new NotFoundException('No hadiths found');
        }

        return this.mapHadithResponse(hadith);
    }

    async findDaily(language: string = 'en') {
        const count = await this.prisma.hadith.count();
        if (count === 0) {
            return null;
        }

        const now = new Date();
        const start = new Date(now.getFullYear(), 0, 0);
        const diff = now.getTime() - start.getTime();
        const oneDay = 1000 * 60 * 60 * 24;
        const dayOfYear = Math.floor(diff / oneDay);

        const skip = dayOfYear % count;

        const hadith = await this.prisma.hadith.findFirst({
            skip,
            include: {
                translations: {
                    where: { languageCode: language },
                },
                collectionRef: true,
            },
            orderBy: { id: 'asc' },
        });

        if (!hadith) {
            return null;
        }

        return this.mapHadithResponse(hadith);
    }

    private normalizeArabic(text: string): string {
        // Remove Arabic diacritics (tashkeel/harakat): U+064B–U+065F, U+0670
        return text
            .replace(/[\u064B-\u065F\u0670]/g, '')
            // Normalize alef variants to plain alef
            .replace(/[أإآ]/g, 'ا')
            // Normalize teh marbuta
            .replace(/ة/g, 'ه')
            // Normalize yaa variants
            .replace(/ى/g, 'ي')
            .trim();
    }

    async search(query: string = '', language: string = 'en', page: number = 1, limit: number = 20, collection?: string, grade?: string) {
        const trimmed = (query || '').trim();
        if (!trimmed) {
            return {
                data: [],
                pagination: { page, limit, total: 0, totalPages: 0, hasNext: false, hasPrev: false },
            };
        }

        // Route to numeric search if pure number
        const numericMatch = trimmed.match(/^\d+$/);
        if (numericMatch) {
            const hadithNumber = parseInt(trimmed, 10);
            return this.searchWithNumberPriority(hadithNumber, trimmed, language, page, limit, collection, grade);
        }

        // Normalize Arabic text for better matching
        const normalizedQuery = this.normalizeArabic(trimmed);
        const isArabic = /[\u0600-\u06FF]/.test(trimmed);

        // Cache key for search results
        const cacheKey = `search:meili:${normalizedQuery}:${language}:${page}:${limit}:${collection || 'none'}:${grade || 'none'}`;
        
        try {
            const cached = await this.redis.get(cacheKey);
            if (cached) {
                return JSON.parse(cached);
            }
        } catch (e) {
            console.error('Search cache read error:', e);
        }

        // Use Meilisearch
        const filter: string[] = [];
        if (collection) filter.push(`collection = "${collection}"`);
        if (grade) filter.push(`grade = "${grade}"`);
        if (language) filter.push(`languageCode = "${language}"`);

        let meiliResults: any = { hits: [], estimatedTotalHits: 0 };
        try {
            meiliResults = await this.meilisearch.search(normalizedQuery, {
                filter: filter.length > 0 ? filter.join(' AND ') : undefined,
                offset: (page - 1) * limit,
                limit: limit,
            });
        } catch (e) {
            console.error('Meilisearch error, falling back to Prisma:', e);
        }

        // If Meilisearch returns results, use them
        if (meiliResults.hits && meiliResults.hits.length > 0) {
            const results = {
                data: meiliResults.hits.map(hit => ({
                    id: hit.id,
                    collection: hit.collection,
                    bookNumber: hit.bookNumber,
                    hadithNumber: hit.hadithNumber,
                    arabicText: hit.arabicText,
                    translation: {
                        text: hit.translations ? (hit.translations[0]?.text || '') : (hit.text || ''),
                        grade: hit.grade,
                        languageCode: hit.languageCode
                    }
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

            try {
                await this.redis.set(cacheKey, JSON.stringify(results), 'EX', 86400);
            } catch (e) { /* ignore cache errors */ }

            return results;
        }

        // Fallback: Prisma full-text search with normalized Arabic
        const skip = (page - 1) * limit;
        const searchTerms = [trimmed];
        if (isArabic && normalizedQuery !== trimmed) searchTerms.push(normalizedQuery);

        const orConditions: any[] = searchTerms.flatMap(term => [
            { arabicText: { contains: term, mode: 'insensitive' } },
            { translations: { some: { text: { contains: term, mode: 'insensitive' }, languageCode: language } } },
        ]);

        const where: any = { OR: orConditions };
        if (collection) where.AND = [{ OR: [{ collection }, { collectionRef: { slug: collection } }] }];
        if (grade) {
            where.AND = [...(where.AND || []), { translations: { some: { grade, languageCode: language } } }];
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
        const results = {
            data: hadiths.map(h => this.mapHadithResponse(h)),
            pagination: {
                page,
                limit,
                total,
                totalPages,
                hasNext: page < totalPages,
                hasPrev: page > 1,
            },
        };

        if (results.data.length > 0) {
            try {
                await this.redis.set(cacheKey, JSON.stringify(results), 'EX', 3600);
            } catch (e) { /* ignore */ }
        }

        return results;
    }

    async getSuggestions(query: string, language: string = 'en') {
        // Meilisearch placeholder for now
        return [];
    }

    async spellSuggest(query: string, language: string = 'en') {
        // Meilisearch handles typo tolerance automatically
        return [];
    }



    private async searchWithNumberPriority(
        hadithNumber: number,
        query: string,
        language: string,
        page: number,
        limit: number,
        collection?: string,
        grade?: string
    ) {
        const offset = (page - 1) * limit;

        // Base where for exact match
        const exactWhere: any = { hadithNumber: hadithNumber };
        if (collection) {
            exactWhere.OR = [
                { collection: collection },
                { collectionRef: { slug: collection } }
            ];
        }
        if (grade) {
            exactWhere.translations = { some: { grade, languageCode: language } };
        }

        // Get count of exact matches
        const exactCount = await this.prisma.hadith.count({ where: exactWhere });

        let exactHadiths: any[] = [];
        let otherHadiths: any[] = [];

        // Fetch Exact Matches if within range
        if (offset < exactCount) {
            const take = Math.min(limit, exactCount - offset);
            exactHadiths = await this.prisma.hadith.findMany({
                where: exactWhere,
                skip: offset,
                take: take,
                include: {
                    translations: { where: { languageCode: language } },
                    collectionRef: true,
                },
                orderBy: [{ bookNumber: 'asc' }, { hadithNumber: 'asc' }]
            });
        }

        // Calculate if we need "Other" matches
        const spotsRemaining = limit - exactHadiths.length;
        const otherOffset = Math.max(0, offset - exactCount);

        if (spotsRemaining > 0) {
            // Find IDs for partial number matches using Raw Query
            // We need to find hadiths where CAST(hadithNumber as TEXT) LIKE '%query%' but NOT equal to query
            // Prisma doesn't support casting in where easily, so we use queryRaw for ID retrieval

            // Note: This raw query needs to be careful with SQL injection, but 'query' is validated as numeric digit string above.
            // Using parameterized query is safer.
            const likeQuery = `%${query}%`;

            // We need to handle collection filtering in raw query if present.
            // This gets complicated with raw queries. 
            // Alternative: Fetch ALL IDs matching partial number (it shouldn't be too huge) and filter in Prisma?
            // "1027", "270", "271"... could be many.

            // Simpler approach that covers 90% cases without raw query complexity for filtering:
            // Use prisma to search text fields, and ONLY use raw query to finding IDs for partial hadith numbers, then combine.

            const partialNumberIdsRaw: { id: number }[] = await this.prisma.$queryRaw`
                SELECT id FROM hadiths 
                WHERE CAST(hadith_number AS TEXT) LIKE ${likeQuery}
                AND hadith_number != ${hadithNumber}
            `;
            const partialNumberIds = partialNumberIdsRaw.map(r => r.id);

            // Construct Other Query
            const otherWhere: any = {
                AND: [
                    {
                        OR: [
                            { arabicText: { contains: query, mode: 'insensitive' } },
                            { translations: { some: { text: { contains: query, mode: 'insensitive' }, languageCode: language } } },
                            { id: { in: partialNumberIds } }
                        ]
                    },
                    // Exclude exact matches we already counted (redundant if using hadithNumber != above, but good for safety)
                    { hadithNumber: { not: hadithNumber } }
                ]
            };

            if (collection) {
                otherWhere.AND.push({
                    OR: [
                        { collection: collection },
                        { collectionRef: { slug: collection } }
                    ]
                });
            }
            if (grade) {
                otherWhere.AND.push({
                    translations: { some: { grade, languageCode: language } }
                });
            }

            otherHadiths = await this.prisma.hadith.findMany({
                where: otherWhere,
                skip: otherOffset,
                take: spotsRemaining,
                include: {
                    translations: { where: { languageCode: language } },
                    collectionRef: true,
                },
                // Order by relevance is hard without search engine. Default ordering.
                orderBy: [{ bookNumber: 'asc' }, { hadithNumber: 'asc' }]
            });
        }

        // Total Count for Pagination
        // We need total count of "Others" to add to exactCount
        // Re-construct the 'otherWhere' purely for counting (it's the same object)
        // Re-calculating the partial IDs might be needed if we need total count distinct from the fetch logic
        // But we already have the logic above.
        // Wait, to get TOTAL count efficiently:

        const likeQueryForCount = `%${query}%`;
        const partialIdsForCountRaw: { id: number }[] = await this.prisma.$queryRaw`
             SELECT id FROM hadiths 
             WHERE CAST(hadith_number AS TEXT) LIKE ${likeQueryForCount}
             AND hadith_number != ${hadithNumber}
         `;
        const partialNumberIdsCount = partialIdsForCountRaw.map(r => r.id);

        const otherWhereCount: any = {
            AND: [
                {
                    OR: [
                        { arabicText: { contains: query, mode: 'insensitive' } },
                        { translations: { some: { text: { contains: query, mode: 'insensitive' }, languageCode: language } } },
                        { id: { in: partialNumberIdsCount } }
                    ]
                },
                { hadithNumber: { not: hadithNumber } }
            ]
        };
        if (collection) {
            otherWhereCount.AND.push({
                OR: [
                    { collection: collection },
                    { collectionRef: { slug: collection } }
                ]
            });
        }
        if (grade) {
            otherWhereCount.AND.push({
                translations: { some: { grade, languageCode: language } }
            });
        }

        const otherCount = await this.prisma.hadith.count({ where: otherWhereCount });
        const total = exactCount + otherCount;
        const totalPages = Math.ceil(total / limit);

        return {
            data: [...exactHadiths, ...otherHadiths].map(h => this.mapHadithResponse(h)),
            pagination: {
                page,
                limit,
                total,
                totalPages,
                hasNext: page < totalPages,
                hasPrev: page > 1,
            },
        };
    }


}

