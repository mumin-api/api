import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

/**
 * Seed script for Sahih al-Bukhari hadiths
 * 
 * Data sources:
 * 1. Local JSON file (recommended)
 * 2. Sunnah.com API
 * 3. GitHub: https://github.com/sunnah-com/hadith-json
 */

async function seedFromLocalJSON() {
    console.log('📚 Seeding from local JSON file...');

    // Expected format: prisma/seed-data/bukhari.json
    const dataPath = path.join(__dirname, '../prisma/seed-data/bukhari.json');

    if (!fs.existsSync(dataPath)) {
        console.error('❌ File not found:', dataPath);
        console.log('\n📥 Download hadith data:');
        console.log('1. Clone: git clone https://github.com/sunnah-com/hadith-json');
        console.log('2. Copy bukhari.json to prisma/seed-data/');
        console.log('3. Run: npm run seed');
        return;
    }

    const data = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));

    let count = 0;

    for (const book of data.books || []) {
        for (const hadith of book.hadiths || []) {
            // Create hadith
            const createdHadith = await prisma.hadith.create({
                data: {
                    collection: 'sahih-bukhari',
                    bookNumber: book.bookNumber || 1,
                    hadithNumber: hadith.hadithNumber || count + 1,
                    arabicText: hadith.arabicText || hadith.text_ar || '',
                    arabicNarrator: hadith.arabicNarrator || hadith.narrator_ar || null,
                    metadata: {
                        grade: hadith.grade || 'sahih',
                        reference: hadith.reference || null,
                    },
                },
            });

            // Create English translation
            if (hadith.englishText || hadith.text_en) {
                await prisma.translation.create({
                    data: {
                        hadithId: createdHadith.id,
                        languageCode: 'en',
                        text: hadith.englishText || hadith.text_en,
                        narrator: hadith.englishNarrator || hadith.narrator_en || null,
                    },
                });
            }

            count++;

            if (count % 100 === 0) {
                console.log(`✅ Seeded ${count} hadiths...`);
            }
        }
    }

    console.log(`\n🎉 Successfully seeded ${count} hadiths!`);
}

async function seedSampleData() {
    console.log('📚 Seeding sample hadiths for testing...');

    const sampleHadiths = [
        {
            collection: 'sahih-bukhari',
            bookNumber: 1,
            hadithNumber: 1,
            arabicText:
                'إِنَّمَا الأَعْمَالُ بِالنِّيَّاتِ، وَإِنَّمَا لِكُلِّ امْرِئٍ مَا نَوَى',
            arabicNarrator: 'عمر بن الخطاب رضي الله عنه',
            englishText:
                'Actions are according to intentions, and everyone will get what was intended.',
            englishNarrator: 'Umar bin Al-Khattab (may Allah be pleased with him)',
            metadata: {
                grade: 'sahih',
                reference: 'Sahih al-Bukhari 1',
            },
        },
        {
            collection: 'sahih-bukhari',
            bookNumber: 1,
            hadithNumber: 2,
            arabicText:
                'بُنِيَ الإِسْلاَمُ عَلَى خَمْسٍ: شَهَادَةِ أَنْ لاَ إِلَهَ إِلاَّ اللَّهُ وَأَنَّ مُحَمَّدًا رَسُولُ اللَّهِ',
            arabicNarrator: 'عبد الله بن عمر رضي الله عنهما',
            englishText:
                'Islam is built upon five pillars: testifying that there is no deity worthy of worship except Allah and that Muhammad is the Messenger of Allah...',
            englishNarrator: 'Abdullah bin Umar (may Allah be pleased with them)',
            metadata: {
                grade: 'sahih',
                reference: 'Sahih al-Bukhari 8',
            },
        },
        {
            collection: 'sahih-bukhari',
            bookNumber: 2,
            hadithNumber: 3,
            arabicText: 'الْمُسْلِمُ مَنْ سَلِمَ الْمُسْلِمُونَ مِنْ لِسَانِهِ وَيَدِهِ',
            arabicNarrator: 'عبد الله بن عمرو رضي الله عنهما',
            englishText:
                'A Muslim is the one from whose tongue and hands the Muslims are safe.',
            englishNarrator: 'Abdullah bin Amr (may Allah be pleased with them)',
            metadata: {
                grade: 'sahih',
                reference: 'Sahih al-Bukhari 10',
            },
        },
    ];

    for (const hadith of sampleHadiths) {
        const createdHadith = await prisma.hadith.create({
            data: {
                collection: hadith.collection,
                bookNumber: hadith.bookNumber,
                hadithNumber: hadith.hadithNumber,
                arabicText: hadith.arabicText,
                arabicNarrator: hadith.arabicNarrator,
                metadata: hadith.metadata,
            },
        });

        await prisma.translation.create({
            data: {
                hadithId: createdHadith.id,
                languageCode: 'en',
                text: hadith.englishText,
                narrator: hadith.englishNarrator,
            },
        });
    }

    console.log(`\n🎉 Successfully seeded ${sampleHadiths.length} sample hadiths!`);
}

async function main() {
    console.log('🌱 Starting database seed...\n');

    try {
        // Try to seed from local JSON first
        const dataPath = path.join(__dirname, '../prisma/seed-data/bukhari.json');

        if (fs.existsSync(dataPath)) {
            await seedFromLocalJSON();
        } else {
            console.log('⚠️  No local data found. Seeding sample data for testing...\n');
            await seedSampleData();
            console.log('\n📥 To seed full hadith collection:');
            console.log('1. Download: https://github.com/sunnah-com/hadith-json');
            console.log('2. Place bukhari.json in prisma/seed-data/');
            console.log('3. Run: npm run seed');
        }
    } catch (error) {
        console.error('❌ Seeding failed:', error);
        throw error;
    } finally {
        await prisma.$disconnect();
    }
}

main()
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
