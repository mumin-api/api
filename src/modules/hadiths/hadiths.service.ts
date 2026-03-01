import { Injectable, NotFoundException, Inject } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { GetHadithsDto } from './dto/get-hadiths.dto';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '@/common/redis/redis.module';
import { 
    TrigramSearchEngine, 
    QueryProcessor, 
    DatabaseAdapter 
} from '../../../../pg-smart-search/src'; // In production, this would be from 'pg-smart-search'

@Injectable()
export class HadithsService {
    private searchEngine: TrigramSearchEngine;

    constructor(
        private prisma: PrismaService,
        @Inject(REDIS_CLIENT) private redis: Redis,
    ) { 
        // Initialize the universal search engine
        const adapter: DatabaseAdapter = {
            query: (sql: string, params?: any[]) => this.prisma.$queryRawUnsafe(sql, ...(params || [])),
            execute: (sql: string, params?: any[]) => {
                const result = this.prisma.$executeRawUnsafe(sql, ...(params || []));
                return result as unknown as Promise<void>;
            },
            transaction: (cb: (adapter: DatabaseAdapter) => Promise<any>) => this.prisma.$transaction(async (tx: any) => {
                const txAdapter: DatabaseAdapter = {
                    query: (sql: string, params?: any[]) => tx.$queryRawUnsafe(sql, ...(params || [])),
                    execute: (sql: string, params?: any[]) => tx.$executeRawUnsafe(sql, ...(params || [])) as unknown as Promise<void>,
                    transaction: (innerCb) => cb(txAdapter) // Simplified nesting
                };
                return cb(txAdapter);
            })
        };

        this.searchEngine = new TrigramSearchEngine(adapter, {
            tableName: 'hadiths', // Note: Real implementation uses joins for translations, 
                                 // so standard search engine might need a custom query or view.
            searchColumns: ['arabic_text'],
            idColumn: 'id'
        });
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

    async search(query: string = '', language: string = 'en', page: number = 1, limit: number = 20, collection?: string, grade?: string) {
        const trimmed = (query || '').trim();

        // Use library for validation
        const validation = QueryProcessor.validate(trimmed);
        if (!validation.valid) {
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

        // Normalize query via library
        const normalized = QueryProcessor.normalize(trimmed);

        // Feature flag: use fuzzy search or fallback to legacy
        const useFuzzySearch = process.env.ENABLE_FUZZY_SEARCH !== 'false'; // Default: enabled

        // Cache key for search results (using normalized query)
        const cacheKey = `search:v2:${normalized}:${language}:${page}:${limit}:${collection || 'none'}:${grade || 'none'}`;
        
        try {
            const cached = await this.redis.get(cacheKey);
            if (cached) {
                return JSON.parse(cached);
            }
        } catch (e) {
            console.error('Search cache read error:', e);
        }

        // Use the centralized search engine
        const results = await this.searchEngine.search({
            query: normalized,
            language,
            page,
            limit,
            filters: {
                collection,
                grade
            }
        });

        // Cache if results found (even if corrected)
        if (results && results.data && results.data.length > 0) {
            try {
                await this.redis.set(cacheKey, JSON.stringify(results), 'EX', 86400); // 24 hours
            } catch (e) {
                console.error('Search cache write error:', e);
            }
        }

        return results;
    }

    /**
     * Get search suggestions based on topics
     * Uses trigram similarity for fuzzy matching
     */
    async getSuggestions(query: string, language: string = 'en') {
        const validation = QueryProcessor.validate(query);
        if (!validation.valid || query.length < 2) return [];

        // If query contains Cyrillic, transliterate to Latin so it can match English topic names
        const hasCyrillic = /[а-яё]/i.test(query);
        const searchQuery = hasCyrillic ? QueryProcessor.transliterate(query) : query;
        const escapedQuery = searchQuery.replace(/'/g, "''");

        // Build language-specific column name
        const nameColumn = language === 'ar' ? 'name_arabic' : 'name_english';

        const suggestions: any[] = await this.prisma.$queryRawUnsafe(`
            SELECT 
                ${nameColumn} as name,
                slug,
                word_similarity('${escapedQuery}', ${nameColumn}) as score
            FROM topics
            WHERE ${nameColumn} IS NOT NULL
              AND (${nameColumn} ILIKE '%${escapedQuery}%' OR '${escapedQuery}' <% ${nameColumn})
            ORDER BY score DESC
            LIMIT 5
        `);

        return suggestions.map(s => ({
            name: s.name,
            slug: s.slug,
            score: parseFloat(s.score)
        }));
    }

    /**
     * Spell suggestions: extract real words from hadith text that are
     * similar to the query. Uses GIN index for fast pre-filtering.
     * e.g. "рророк" → ["пророк"]
     */
    async spellSuggest(query: string, language: string = 'en') {
        if (!query || query.trim().length < 3) return [];

        const escapedQuery = query.trim().replace(/'/g, "''");
        // Allow only word characters to prevent SQL injection
        if (!/^[\wа-яёА-ЯЁa-zA-Z\s\u0600-\u06FF]+$/.test(query)) return [];

        const results: any[] = await this.prisma.$queryRawUnsafe(`
            SELECT word, word_similarity('${escapedQuery}', word) as sim
            FROM (
                SELECT DISTINCT unnest(regexp_split_to_array(lower(text), '[^\\wа-яёa-z\\u0600-\\u06FF]+')) as word
                FROM translations
                WHERE language_code = '${language}'
                  AND word_similarity('${escapedQuery}', text) > 0.3
            ) words
            WHERE length(word) > 2
              AND word_similarity('${escapedQuery}', word) > 0.4
            ORDER BY sim DESC
            LIMIT 3
        `);

        return results.map(r => ({
            word: r.word,
            score: parseFloat(r.sim)
        }));
    }


    /**
     * Search logic is now handled by @mumin/pg-smart-search
     */



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

