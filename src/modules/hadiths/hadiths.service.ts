import { Injectable, NotFoundException, Inject } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { GetHadithsDto } from './dto/get-hadiths.dto';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '@/common/redis/redis.module';

@Injectable()
export class HadithsService {
    constructor(
        private prisma: PrismaService,
        @Inject(REDIS_CLIENT) private redis: Redis,
    ) { }

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

    async search(query: string, language: string = 'en', page: number = 1, limit: number = 20, collection?: string, grade?: string) {
        const trimmed = query.trim();

        // Edge case validation
        const validation = this.validateSearchQuery(trimmed);
        if (!validation.valid) {
            return {
                data: [],
                pagination: {
                    page,
                    limit,
                    total: 0,
                    totalPages: 0,
                    hasNext: false,
                    hasPrev: false,
                },
            };
        }

        // Route to numeric search if pure number
        const numericMatch = trimmed.match(/^\d+$/);
        if (numericMatch) {
            const hadithNumber = parseInt(trimmed, 10);
            return this.searchWithNumberPriority(hadithNumber, trimmed, language, page, limit, collection, grade);
        }

        // Normalize query for consistent caching and searching
        const normalized = this.normalizeQuery(trimmed);

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

        let results;
        if (useFuzzySearch) {
            results = await this.fuzzySearch(normalized, language, page, limit, collection, grade);
        } else {
            results = await this.standardSearch(normalized, language, page, limit, collection, grade);
        }

        // --- Smart Layout Fallback ---
        // If results are empty and it looks like a keyboard layout mismatch (Latin input but searching in RU context)
        // We only trigger this if the primary search failed to prevent false positives for actual English words.
        if (results.pagination.total === 0 && language === 'ru' && /^[a-z0-9\s.,!?;:]+$/i.test(normalized)) {
            const corrected = this.convertLayout(normalized);
            if (corrected !== normalized) {
                let correctedResults;
                if (useFuzzySearch) {
                    correctedResults = await this.fuzzySearch(corrected, language, page, limit, collection, grade);
                } else {
                    correctedResults = await this.standardSearch(corrected, language, page, limit, collection, grade);
                }

                if (correctedResults.pagination.total > 0) {
                    results = correctedResults;
                    // Add a hint that this was corrected
                    results['metadata'] = { ...results['metadata'], correctedFrom: normalized };
                }
            }
        }

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
        const { valid } = this.validateSearchQuery(query);
        if (!valid || query.length < 2) return [];

        const escapedQuery = query.replace(/'/g, "''");
        
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
     * Normalize query: lowercase, trim, remove redundant punctuation
     */
    private normalizeQuery(query: string): string {
        return query
            .toLowerCase()
            .trim()
            .replace(/[.,!?;:]+$/, '') // Remove trailing punctuation
            .replace(/\s+/g, ' ');      // Collapse multiple spaces
    }

    /**
     * Convert English keyboard layout to Russian (Smart Layout)
     */
    private convertLayout(query: string): string {
        const en = "qwertyuiop[]asdfghjkl;'zxcvbnm,./QWERTYUIOP{}ASDFGHJKL:\"ZXCVBNM<>?".split('');
        const ru = "йцукенгшщзхъфывапролджэячсмитьбю.ЙЦУКЕНГШЩЗХЪФЫВАПРОЛДЖЭЯЧСМИТЬБЮ,".split('');
        
        const map: Record<string, string> = {};
        en.forEach((char, i) => map[char] = ru[i]);

        return query.split('').map(char => map[char] || char).join('');
    }

    /**
     * Validate search query for edge cases
     */
    private validateSearchQuery(query: string): { valid: boolean; reason?: string } {
        // Empty query
        if (!query) {
            return { valid: false, reason: 'empty' };
        }

        // Too short for meaningful search
        if (query.length < 2) {
            return { valid: false, reason: 'too_short' };
        }

        // Only punctuation/special chars (no valid text)
        if (!/[а-яА-ЯёЁa-zA-Z0-9\u0600-\u06FF]/.test(query)) {
            return { valid: false, reason: 'no_valid_chars' };
        }

        return { valid: true };
    }

    /**
     * Calculate dynamic similarity threshold based on query characteristics
     */
    /**
     * Calculate dynamic similarity threshold based on query characteristics
     * Optimized for word_similarity (substring matching) which generally produces higher scores
     * than full string similarity.
     */
    private calculateSimilarityThreshold(query: string): number {
        const length = query.length;
        const wordCount = query.split(/\s+/).length;

        // Very short queries (< 5 chars) - need very high precision
        if (length < 5 && wordCount === 1) {
            return 0.8; // e.g., "iman" should not match "animal"
        }

        // 5 chars exactly - strict but allows prefix matches like "проро" -> "пророк" (score ~0.8)
        if (length === 5 && wordCount === 1) {
            return 0.7;
        }

        // 6-9 chars - balanced for typos (e.g. "рророк" -> "пророк" is ~0.57)
        if (length < 10 && wordCount === 1) {
            return 0.5;
        }

        // Medium queries
        if (length < 30) {
            return 0.4;
        }

        // Long queries - allow more flexibility
        return 0.3;
    }

    /**
     * Fuzzy search using PostgreSQL trigram similarity
     */
    private async fuzzySearch(query: string, language: string, page: number, limit: number, collection?: string, grade?: string) {
        const startTime = Date.now();
        const threshold = this.calculateSimilarityThreshold(query);

        try {
            // Tier 1: Strict trigram search
            const results = await this.trigramSearch(query, threshold, language, page, limit, collection, grade);

            // Log performance
            const duration = Date.now() - startTime;
            if (duration > 200) {
                console.warn(`Slow fuzzy search: "${query}" took ${duration}ms`);
            }

            // Tier 2: Fallback to keyword search if no results
            if (results.pagination.total === 0) {
                console.log(`Trigram found 0 results for "${query}", falling back to keyword search`);
                return this.keywordFallbackSearch(query, language, page, limit, collection, grade);
            }

            return results;
        } catch (error) {
            console.error(`Fuzzy search failed for "${query}":`, error);
            // Fallback to standard search on error
            return this.standardSearch(query, language, page, limit, collection, grade);
        }
    }

    /**
     * Trigram similarity search using raw SQL
     * Uses subquery to find matching IDs first for optimal index usage
     * Wrapped in transaction to ensure set_limit applies to the query
     */
    private async trigramSearch(
        query: string,
        threshold: number,
        language: string,
        page: number,
        limit: number,
        collection?: string,
        grade?: string
    ) {
        // Use a 15-second timeout for the transaction
        return this.prisma.$transaction(async (tx) => {
            const skip = (page - 1) * limit;

            // Set word similarity threshold for <% operator within this transaction
            // Note: set_limit() only works for %, we need word_similarity_threshold for <%
            await tx.$executeRawUnsafe(`SET pg_trgm.word_similarity_threshold = ${threshold};`);

            const escapedQuery = query.replace(/'/g, "''");
            const escapedLanguage = language.replace(/'/g, "''");

            // Build collection filter for subquery
            let collectionJoin = '';
            let collectionWhere = '';
            if (collection) {
                const escapedCollection = collection.replace(/'/g, "''");
                collectionJoin = 'LEFT JOIN collections c ON h.collection_id = c.id';
                collectionWhere = `AND (h.collection = '${escapedCollection}' OR c.slug = '${escapedCollection}')`;
            }

            // Build grade filter
            let gradeWhere = '';
            if (grade) {
                const escapedGrade = grade.replace(/'/g, "''");
                gradeWhere = `AND grade = '${escapedGrade}'`;
            }

            // Combined query for Data + Total Count using Window Function
            // Uses <% operator for word similarity (finding query roughly inside text)
            const results: any[] = await tx.$queryRawUnsafe(`
                WITH matching_translations AS (
                    SELECT hadith_id, 
                           word_similarity('${escapedQuery}', text) as score
                    FROM translations
                    WHERE language_code = '${escapedLanguage}'
                      AND (text ILIKE '%${escapedQuery}%' OR '${escapedQuery}' <% text)
                ),
                matching_arabic AS (
                    SELECT id as hadith_id,
                           word_similarity('${escapedQuery}', arabic_text) as score
                    FROM hadiths
                    WHERE (arabic_text ILIKE '%${escapedQuery}%' OR '${escapedQuery}' <% arabic_text)
                ),
                combined_matches AS (
                    SELECT hadith_id, score FROM matching_translations
                    UNION ALL
                    SELECT hadith_id, score FROM matching_arabic
                ),
                best_scores AS (
                    SELECT hadith_id, MAX(score) as relevance
                    FROM combined_matches
                    GROUP BY hadith_id
                )
                SELECT 
                    h.*,
                    t.text as translation_text,
                    t.narrator as translation_narrator,
                    t.grade as translation_grade,
                    t.translator,
                    t.language_code,
                    c.name_english as collection_name,
                    b.relevance,
                    COUNT(*) OVER() as total_count
                FROM best_scores b
                INNER JOIN hadiths h ON b.hadith_id = h.id
                LEFT JOIN translations t ON h.id = t.hadith_id AND t.language_code = '${escapedLanguage}'
                LEFT JOIN collections c ON h.collection_id = c.id
                WHERE (1=1)
                ${gradeWhere}
                ${collectionWhere}
                ORDER BY b.relevance DESC
                LIMIT ${limit} OFFSET ${skip}
            `);

            const total = results.length > 0 ? Number(results[0].total_count) : 0;
            const totalPages = Math.ceil(total / limit);

            // Map results to hadith format
            const mappedResults = results.map(row => ({
                id: row.id,
                collection: row.collection_name || row.collection,
                collectionId: row.collection_id,
                bookNumber: row.book_number,
                hadithNumber: row.hadith_number,
                arabicText: row.arabic_text,
                arabicNarrator: row.arabic_narrator,
                translation: row.translation_text ? {
                    text: row.translation_text,
                    narrator: row.translation_narrator,
                    grade: row.translation_grade,
                    translator: row.translator,
                    languageCode: row.language_code,
                } : null,
                metadata: row.metadata,
                relevance: parseFloat(row.relevance),
            }));

            return {
                data: mappedResults,
                pagination: {
                    page,
                    limit,
                    total,
                    totalPages,
                    hasNext: page < totalPages,
                    hasPrev: page > 1,
                },
            };
        }, { timeout: 15000 });
    }




    /**
     * Keyword fallback search when trigram finds nothing
     */
    private async keywordFallbackSearch(query: string, language: string, page: number, limit: number, collection?: string, grade?: string) {
        const skip = (page - 1) * limit;

        // Extract keywords (remove stop words)
        const stopWords = ['от', 'до', 'и', 'в', 'на', 'с', 'по', 'для', 'даже', 'если', 'the', 'a', 'an', 'and', 'or', 'but'];
        const keywords = query
            .toLowerCase()
            .split(/\s+/)
            .filter(w => w.length > 2 && !stopWords.includes(w));

        if (keywords.length === 0) {
            // No valid keywords, return empty
            return {
                data: [],
                pagination: { page, limit, total: 0, totalPages: 0, hasNext: false, hasPrev: false },
            };
        }

        // Build OR conditions for each keyword
        const keywordConditions = keywords.map(kw => ({
            OR: [
                { arabicText: { contains: kw, mode: 'insensitive' as const } },
                {
                    translations: {
                        some: {
                            text: { contains: kw, mode: 'insensitive' as const },
                            languageCode: language,
                        },
                    },
                },
            ],
        }));

        const where: any = {
            OR: keywordConditions,
        };

        // Apply collection filter
        if (collection) {
            where.AND = where.AND || [];
            where.AND.push({
                OR: [
                    { collection: collection },
                    { collectionRef: { slug: collection } },
                ],
            });
        }

        // Apply grade filter
        if (grade) {
            where.AND = where.AND || [];
            where.AND.push({
                translations: {
                    some: {
                        grade,
                        languageCode: language,
                    },
                },
            });
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

    private async standardSearch(query: string, language: string, page: number, limit: number, collection?: string, grade?: string) {
        const skip = (page - 1) * limit;

        const where: any = {
            AND: [
                {
                    OR: [
                        { arabicText: { contains: query, mode: 'insensitive' } },
                        {
                            translations: {
                                some: {
                                    text: { contains: query, mode: 'insensitive' },
                                    languageCode: language,
                                },
                            },
                        },
                    ],
                }
            ]
        };

        if (collection) {
            where.AND.push({
                OR: [
                    { collection: collection },
                    { collectionRef: { slug: collection } }
                ]
            });
        }

        if (grade) {
            where.AND.push({
                translations: {
                    some: {
                        grade,
                        languageCode: language,
                    },
                },
            });
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
}

