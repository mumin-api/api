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
