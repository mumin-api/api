import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { GetHadithsDto } from './dto/get-hadiths.dto';

@Injectable()
export class HadithsService {
    constructor(private prisma: PrismaService) { }

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
        const { page = 1, limit = 20, collection, bookNumber, hadithNumber, language = 'en', grade } = dto;
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
            throw new NotFoundException('No hadiths found matching criteria');
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
            throw new NotFoundException('No hadiths found');
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
            throw new NotFoundException('No matching hadith found');
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

        // Feature flag: use fuzzy search or fallback to legacy
        const useFuzzySearch = process.env.ENABLE_FUZZY_SEARCH !== 'false'; // Default: enabled

        if (useFuzzySearch) {
            return this.fuzzySearch(trimmed, language, page, limit, collection, grade);
        } else {
            return this.standardSearch(trimmed, language, page, limit, collection, grade);
        }
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
    private calculateSimilarityThreshold(query: string): number {
        const length = query.length;
        const wordCount = query.split(/\s+/).length;

        // Short single-word queries need higher precision
        if (length < 10 && wordCount === 1) {
            return 0.5; // e.g., "намаз" - must match closely
        }

        // Medium queries - balanced
        if (length < 30) {
            return 0.3; // e.g., "Передавайте от меня"
        }

        // Long queries - more tolerant (more room for variation)
        return 0.25; // e.g., "Передавайте от меня даже если аята"
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
        const skip = (page - 1) * limit;

        // Build WHERE clause parts using Prisma.sql for safety
        const baseWhere = this.prisma.$queryRaw`
            (h.arabic_text % ${query} OR t.text % ${query})
            AND GREATEST(
                similarity(h.arabic_text, ${query}),
                similarity(t.text, ${query})
            ) > ${threshold}
        `;

        // Build complete query dynamically
        let whereClause = `
            (h.arabic_text % '${query.replace(/'/g, "''")}'::text OR t.text % '${query.replace(/'/g, "''")}'::text)
            AND GREATEST(
                similarity(h.arabic_text, '${query.replace(/'/g, "''")}'::text),
                similarity(t.text, '${query.replace(/'/g, "''")}'::text)
            ) > ${threshold}
        `;

        if (collection) {
            whereClause += ` AND (h.collection = '${collection.replace(/'/g, "''")}'::text OR c.slug = '${collection.replace(/'/g, "''")}'::text)`;
        }

        if (grade) {
            whereClause += ` AND t.grade = '${grade.replace(/'/g, "''")}'::text`;
        }

        // Execute main query
        const results: any[] = await this.prisma.$queryRawUnsafe(`
            SELECT 
                h.id,
                h.hadith_number,
                h.book_number,
                h.arabic_text,
                h.arabic_narrator,
                h.collection,
                h.collection_id,
                h.metadata,
                t.text as translation_text,
                t.narrator as translation_narrator,
                t.grade as translation_grade,
                t.translator,
                t.language_code,
                c.name_english as collection_name,
                GREATEST(
                    similarity(h.arabic_text, '${query.replace(/'/g, "''")}'::text),
                    similarity(t.text, '${query.replace(/'/g, "''")}'::text)
                ) as relevance
            FROM hadiths h
            LEFT JOIN translations t ON h.id = t.hadith_id AND t.language_code = '${language.replace(/'/g, "''")}'::text
            LEFT JOIN collections c ON h.collection_id = c.id
            WHERE ${whereClause}
            ORDER BY relevance DESC
            LIMIT ${limit}
            OFFSET ${skip}
        `);

        // Get total count
        const countResult: any[] = await this.prisma.$queryRawUnsafe(`
            SELECT COUNT(DISTINCT h.id) as total
            FROM hadiths h
            LEFT JOIN translations t ON h.id = t.hadith_id AND t.language_code = '${language.replace(/'/g, "''")}'::text
            LEFT JOIN collections c ON h.collection_id = c.id
            WHERE ${whereClause}
        `);

        const total = parseInt(countResult[0]?.total || '0');
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
            relevance: parseFloat(row.relevance), // Include relevance score
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

