import { HadithsService } from '../modules/hadiths/hadiths.service';

// Mock Prisma
class MockPrismaService {
    hadith = {
        count: async (args: any) => {
            console.log('Provide mock count for:', JSON.stringify(args.where));
            // Return dummy counts to trigger different code paths
            if (args.where.hadithNumber === 27) return 1; // 1 exact match
            if (args.where.AND && args.where.AND.length > 0) return 5; // 5 partial matches
            return 0;
        },
        findMany: async (args: any) => {
            console.log('Provide mock findMany for:', JSON.stringify(args.where));
            // Return dummy data
            if (args.where.hadithNumber === 27) {
                return [{ id: 100, hadithNumber: 27, collection: 'bukhari', bookNumber: 1, translations: [{ text: 'text' }], collectionRef: { nameEnglish: 'Bukhari' } }];
            }
            return [
                { id: 200, hadithNumber: 1027, collection: 'bukhari', bookNumber: 2, translations: [], collectionRef: { nameEnglish: 'Bukhari' } },
                { id: 300, hadithNumber: 5, collection: 'bukhari', bookNumber: 3, translations: [{ text: 'contains 27' }], collectionRef: { nameEnglish: 'Bukhari' } }
            ];
        },
        findUnique: async () => null,
        findFirst: async () => null,
    };

    $queryRaw = async (query: any, ...values: any[]) => {
        console.log('Execute queryRaw:', query[0], values);
        // Mock returning partial ID matches
        // Query usually: SELECT id FROM hadiths WHERE ... LIKE ...
        return [{ id: 200 }]; // ID 200 matches partial
    }
}

// Mock Redis
class MockRedis {
    get = async () => null;
    set = async () => 'OK';
}

async function verify() {
    const prisma = new MockPrismaService();
    const service = new HadithsService(prisma as any, new MockRedis() as any);

    console.log('--- TEST 1: Search "27" (Logic check) ---');
    // We expect:
    // 1. count(exactWhere) -> returns 1
    // 2. findMany(exactWhere) -> returns [Hadith 27]
    // 3. queryRaw -> returns [ID 200]
    // 4. findMany(otherWhere) -> returns [Hadith 1027, Hadith 5]
    // 5. count(otherWhereCount) -> returns 5
    // Result: [Hadith 27, Hadith 1027, Hadith 5]

    try {
        const res = await service.search('27', 'en', 1, 10);

        console.log('Total:', res.pagination.total);
        console.log('Data length:', res.data.length);

        const first = res.data[0];
        if (first.hadithNumber === 27) {
            console.log('✅ Correctly prioritized exact match.');
        } else {
            console.log('❌ Failed to prioritize exact match.');
        }

        if (res.data.length > 1) {
            console.log('✅ Included other matches.');
        }

    } catch (e) {
        console.error(e);
    }
}

verify();
