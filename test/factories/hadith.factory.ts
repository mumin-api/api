import { PrismaClient } from '@prisma/client';
import { faker } from '@faker-js/faker';

const prisma = new PrismaClient();

export const HadithFactory = {
    async create(overrides: any = {}) {
        return prisma.hadith.create({
            data: {
                collection: overrides.collection || 'Sahih Bukhari',
                bookNumber: overrides.bookNumber || faker.number.int({ min: 1, max: 100 }),
                hadithNumber: overrides.hadithNumber || faker.number.int({ min: 1, max: 7000 }),
                arabicText: overrides.arabicText || faker.lorem.paragraph(),
                arabicNarrator: overrides.arabicNarrator || faker.person.fullName(),
                metadata: overrides.metadata || {},
                ...overrides,
            },
        });
    },

    async createWithTranslation(overrides: any = {}) {
        const hadith = await this.create(overrides);
        await prisma.translation.create({
            data: {
                hadithId: hadith.id,
                languageCode: overrides.languageCode || 'en',
                text: overrides.translationText || faker.lorem.paragraph(),
                grade: overrides.grade || 'Sahih',
                translator: overrides.translator || faker.person.fullName(),
            },
        });
        return hadith;
    }
};

export const CollectionFactory = {
    async create(overrides: any = {}) {
        const name = overrides.nameEnglish || faker.word.noun();
        return prisma.collection.create({
            data: {
                nameEnglish: name,
                slug: overrides.slug || name.toLowerCase(),
                nameArabic: overrides.nameArabic || '...',
                description: overrides.description || faker.lorem.sentence(),
                ...overrides,
            },
        });
    }
};
