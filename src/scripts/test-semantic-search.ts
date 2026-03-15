import { Test, TestingModule } from '@nestjs/testing';
import { HadithsService } from '../modules/hadiths/hadiths.service';
import { PrismaService } from '@/prisma/prisma.service';
import { VectorService } from '@/common/ai/vector.service';
import { AiService } from '@/common/ai/ai.service';
import { ConfigModule } from '@nestjs/config';
import { AiModule } from '@/common/ai/ai.module';
import { PrismaModule } from '@/prisma/prisma.module';
import { MeilisearchModule } from '@/common/meilisearch/meilisearch.module';
import { EmailModule } from '@/modules/email/email.module';

async function testSearch() {
    const module: TestingModule = await Test.createTestingModule({
        imports: [
            ConfigModule.forRoot(),
            PrismaModule,
            AiModule,
            MeilisearchModule,
            EmailModule,
        ],
        providers: [
            HadithsService,
            {
                provide: 'REDIS_CLIENT',
                useValue: {
                    get: async () => null,
                    set: async () => 'OK',
                },
            },
        ],
    }).compile();

    const service = module.get<HadithsService>(HadithsService);
    
    console.log('Testing semantic search for: "что такое зина"');
    const results = await service.semanticSearch('что такое зина', 'ru', 5);
    console.log('Results:', JSON.stringify(results, null, 2));

    await module.close();
}

testSearch().catch(console.error);
