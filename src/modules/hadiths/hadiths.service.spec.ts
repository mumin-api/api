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
    $queryRaw: jest.fn().mockResolvedValue([]),
    $queryRawUnsafe: jest.fn().mockResolvedValue([]),
    $executeRawUnsafe: jest.fn().mockResolvedValue(0),
    $transaction: jest.fn((cb) => cb(mockPrismaService)),
} as unknown as PrismaService;

const mockRedis = {
    get: jest.fn(),
    set: jest.fn(),
};

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
                {
                    provide: 'REDIS_CLIENT',
                    useValue: mockRedis,
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

        it('should return null if count is 0', async () => {
            (prisma.hadith.count as jest.Mock).mockResolvedValue(0);
            const result = await service.findRandom();
            expect(result).toBeNull();
        });
    });

    describe('search', () => {
        it('should return results from cache if available', async () => {
            const cachedResult = { data: [{ id: 1 }], pagination: { total: 1 } };
            mockRedis.get.mockResolvedValue(JSON.stringify(cachedResult));

            const result = await service.search('test');

            expect(result).toEqual(cachedResult);
            expect(mockRedis.get).toHaveBeenCalled();
            expect(prisma.hadith.findMany).not.toHaveBeenCalled();
        });

        it('should normalize queries and cache results', async () => {
            mockRedis.get.mockResolvedValue(null);
            const mockResults = { data: [], pagination: { total: 0 } };
            (prisma.hadith.findMany as jest.Mock).mockResolvedValue([]);
            (prisma.hadith.count as jest.Mock).mockResolvedValue(0);

            await service.search('  TEST query!!!  ');

            // Verify normalization via cache key
            expect(mockRedis.get).toHaveBeenCalledWith(expect.stringContaining('test query'));
        });

        it('should correct keyboard layout if no results found in RU language', async () => {
            mockRedis.get.mockResolvedValue(null);
            
            // First attempt (EN layout in RU context) -> 0 results
            (prisma.hadith.findMany as jest.Mock).mockResolvedValueOnce([]);
            (prisma.hadith.count as jest.Mock).mockResolvedValueOnce(0);
            
            // Second attempt (Corrected RU layout) -> results
            const mockHadiths = [{ id: 2 }];
            (prisma.hadith.findMany as jest.Mock).mockResolvedValueOnce(mockHadiths);
            (prisma.hadith.count as jest.Mock).mockResolvedValueOnce(1);

            const result = await service.search('hfvflfy', 'ru'); // "hfvflfy" -> "рамадан"

            expect(result.data).toHaveLength(1);
            expect((result as any).metadata.correctedFrom).toBe('hfvflfy');
        });

        it('should prioritize numeric search if query is a number', async () => {
            mockRedis.get.mockResolvedValue(null);
            const mockHadith = { id: 1, hadithNumber: 27, translations: [{ text: 'Test' }] };
            (prisma.hadith.count as jest.Mock).mockResolvedValue(1);
            (prisma.hadith.findMany as jest.Mock).mockResolvedValue([mockHadith]);

            const result = await service.search('27');

            expect(result.data[0].hadithNumber).toBe(27);
            expect(prisma.hadith.findMany).toHaveBeenCalled();
        });
    });
});
