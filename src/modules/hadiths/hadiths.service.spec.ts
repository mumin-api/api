import { Test, TestingModule } from '@nestjs/testing';
import { HadithsService } from './hadiths.service';
import { PrismaService } from '@/prisma/prisma.service';
import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiService } from '@/common/ai/ai.service';
import { VectorService } from '@/common/ai/vector.service';
import { MeilisearchService } from '@/common/meilisearch/meilisearch.service';
import { EmailService } from '@/modules/email/email.service';

const mockPrismaService = {
    hadith: {
        findMany: jest.fn(),
        count: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
    },
    $queryRaw: jest.fn().mockResolvedValue([]),
    $queryRawUnsafe: jest.fn().mockResolvedValue([]),
} as unknown as PrismaService;

const mockRedis = {
    get: jest.fn(),
    set: jest.fn(),
};

const mockConfigService = {
    get: jest.fn(),
};

const mockAiService = {
    generateEmbedding: jest.fn(),
};

const mockVectorService = {
    search: jest.fn(),
};

const mockMeilisearchService = {
    search: jest.fn(),
};

const mockEmailService = {
    sendEmail: jest.fn(),
};

describe('HadithsService', () => {
    let service: HadithsService;
    let prisma: any;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                HadithsService,
                { provide: PrismaService, useValue: mockPrismaService },
                { provide: 'REDIS_CLIENT', useValue: mockRedis },
                { provide: ConfigService, useValue: mockConfigService },
                { provide: AiService, useValue: mockAiService },
                { provide: VectorService, useValue: mockVectorService },
                { provide: MeilisearchService, useValue: mockMeilisearchService },
                { provide: EmailService, useValue: mockEmailService },
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
            const mockHadiths = [{ id: 1, collection: 'Bukhari', translations: [{ text: 'Test' }] }];
            (prisma.hadith.findMany as jest.Mock).mockResolvedValue(mockHadiths);
            (prisma.hadith.count as jest.Mock).mockResolvedValue(1);

            const result = await service.findAll({ page: 1, limit: 10 });

            expect(result.data).toHaveLength(1);
            expect(result.pagination.total).toBe(1);
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

    describe('semanticSearch', () => {
        it('should return results from Pinecone', async () => {
            mockRedis.get.mockResolvedValue(null);
            (mockAiService.generateEmbedding as jest.Mock).mockResolvedValue([0.1, 0.2]);
            (mockVectorService.search as jest.Mock).mockResolvedValue([{ id: 1, score: 0.9 }]);
            (prisma.hadith.findMany as jest.Mock).mockResolvedValue([{ id: 1, collection: 'Bukhari' }]);

            const result = await service.semanticSearch('query');
            expect(result.data).toHaveLength(1);
            expect(mockVectorService.search).toHaveBeenCalled();
        });
    });
});
