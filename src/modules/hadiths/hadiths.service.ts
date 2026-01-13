import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { GetHadithsDto } from './dto/get-hadiths.dto';

@Injectable()
export class HadithsService {
    constructor(private prisma: PrismaService) { }

    async findAll(dto: GetHadithsDto) {
        const { page = 1, limit = 20, collection, bookNumber, hadithNumber, language = 'en' } = dto;
        const skip = (page - 1) * limit;

        const where: any = {};
        if (collection) where.collection = collection;
        if (bookNumber) where.bookNumber = bookNumber;
        if (hadithNumber) where.hadithNumber = hadithNumber;

        const [hadiths, total] = await Promise.all([
            this.prisma.hadith.findMany({
                where,
                skip,
                take: limit,
                include: {
                    translations: {
                        where: { languageCode: language },
                    },
                },
                orderBy: [{ bookNumber: 'asc' }, { hadithNumber: 'asc' }],
            }),
            this.prisma.hadith.count({ where }),
        ]);

        const totalPages = Math.ceil(total / limit);

        return {
            data: hadiths.map((hadith) => ({
                id: hadith.id,
                collection: hadith.collection,
                bookNumber: hadith.bookNumber,
                hadithNumber: hadith.hadithNumber,
                arabicText: hadith.arabicText,
                arabicNarrator: hadith.arabicNarrator,
                translation: hadith.translations[0] || null,
                metadata: hadith.metadata,
            })),
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
            },
        });

        if (!hadith) {
            throw new NotFoundException(`Hadith with ID ${id} not found`);
        }

        return {
            id: hadith.id,
            collection: hadith.collection,
            bookNumber: hadith.bookNumber,
            hadithNumber: hadith.hadithNumber,
            arabicText: hadith.arabicText,
            arabicNarrator: hadith.arabicNarrator,
            translation: hadith.translations[0] || null,
            metadata: hadith.metadata,
        };
    }

    async findRandom(language: string = 'en') {
        // Get total count
        const count = await this.prisma.hadith.count();

        // Generate random skip value
        const skip = Math.floor(Math.random() * count);

        const hadith = await this.prisma.hadith.findFirst({
            skip,
            include: {
                translations: {
                    where: { languageCode: language },
                },
            },
        });

        if (!hadith) {
            throw new NotFoundException('No hadiths found');
        }

        return {
            id: hadith.id,
            collection: hadith.collection,
            bookNumber: hadith.bookNumber,
            hadithNumber: hadith.hadithNumber,
            arabicText: hadith.arabicText,
            arabicNarrator: hadith.arabicNarrator,
            translation: hadith.translations[0] || null,
            metadata: hadith.metadata,
        };
    }

    async search(query: string, language: string = 'en', page: number = 1, limit: number = 20) {
        const skip = (page - 1) * limit;

        // Search in both Arabic text and translations
        const hadiths = await this.prisma.hadith.findMany({
            where: {
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
            },
            skip,
            take: limit,
            include: {
                translations: {
                    where: { languageCode: language },
                },
            },
        });

        const total = await this.prisma.hadith.count({
            where: {
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
            },
        });

        const totalPages = Math.ceil(total / limit);

        return {
            data: hadiths.map((hadith) => ({
                id: hadith.id,
                collection: hadith.collection,
                bookNumber: hadith.bookNumber,
                hadithNumber: hadith.hadithNumber,
                arabicText: hadith.arabicText,
                arabicNarrator: hadith.arabicNarrator,
                translation: hadith.translations[0] || null,
                metadata: hadith.metadata,
            })),
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
