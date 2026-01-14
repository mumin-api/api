import { Test, TestingModule } from '@nestjs/testing';
import { HadithsService } from './hadiths.service';
import { PrismaService } from '@/prisma/prisma.service';
import { NotFoundException } from '@nestjs/common';

const mockPrismaService = {
    hadith: {
        findMany: jest.fn(),
        count: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
    },
} as unknown as PrismaService;

describe('HadithsService', () => {
    let service: HadithsService;
    let prisma: any;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                HadithsService,
                {
                    provide: PrismaService,
                    useValue: mockPrismaService,
                },
            ],
        }).compile();

        service = module.get<HadithsService>(HadithsService);
        prisma = module.get(PrismaService);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('findAll', () => {
        it('should return paginated hadiths', async () => {
            const mockHadiths = [
                { id: 1, collection: 'Bukhari', translations: [{ text: 'Test' }] },
            ];
            (prisma.hadith.findMany as jest.Mock).mockResolvedValue(mockHadiths);
            (prisma.hadith.count as jest.Mock).mockResolvedValue(1);

            const result = await service.findAll({ page: 1, limit: 10 });

            expect(result.data).toHaveLength(1);
            expect(result.pagination.total).toBe(1);
            expect(prisma.hadith.findMany).toHaveBeenCalled();
        });

        it('should filter by collection and grade', async () => {
            await service.findAll({ collection: 'Muslim', grade: 'Sahih' });

            expect(prisma.hadith.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({
                        OR: expect.arrayContaining([
                            { collection: 'Muslim' },
                            { collectionRef: { slug: 'Muslim' } }
                        ]),
                        translations: {
                            some: {
                                grade: 'Sahih',
                                languageCode: 'en'
                            }
                        }
                    })
                })
            );
        });
    });

    describe('findOne', () => {
        it('should return a single hadith if found', async () => {
            const mockHadith = { id: 1, collection: 'Bukhari' };
            (prisma.hadith.findUnique as jest.Mock).mockResolvedValue(mockHadith);

            const result = await service.findOne(1);
            expect(result.id).toBe(1);
        });

        it('should throw NotFoundException if not found', async () => {
            (prisma.hadith.findUnique as jest.Mock).mockResolvedValue(null);

            await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
        });
    });

    describe('findRandom', () => {
        it('should return a random hadith', async () => {
            (prisma.hadith.count as jest.Mock).mockResolvedValue(100);
            (prisma.hadith.findFirst as jest.Mock).mockResolvedValue({ id: 50, collection: 'Abu Dawud' });

            const result = await service.findRandom();
            expect(result).toBeDefined();
            expect(prisma.hadith.findFirst).toHaveBeenCalledWith(expect.objectContaining({
                skip: expect.any(Number)
            }));
        });

        it('should throw NotFound if count is 0', async () => {
            (prisma.hadith.count as jest.Mock).mockResolvedValue(0);
            await expect(service.findRandom()).rejects.toThrow(NotFoundException);
        });
    });
});
