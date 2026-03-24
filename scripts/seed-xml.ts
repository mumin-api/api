import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import * as cheerio from 'cheerio';

const COLLECTION_METADATA: Record<string, { name: string, description: string }> = {
  'bukhari': {
    name: 'Sahih al-Bukhari',
    description: 'The most authentic collection of Hadith, compiled by Imam Muhammad ibn Ismail al-Bukhari.'
  },
  'muslim': {
    name: 'Sahih Muslim',
    description: 'One of the Kutub al-Sittah (six major hadith collections), compiled by Imam Muslim ibn al-Hajjaj.'
  },
  'tirmidhi': {
    name: 'Jami` at-Tirmidhi',
    description: 'A comprehensive collection of hadith compiled by Imam Abu `Isa Muhammad at-Tirmidhi.'
  },
  'abudawud': {
    name: 'Sunan Abi Dawud',
    description: 'A major collection of hadith focusing on legal rulings, compiled by Imam Abu Dawud.'
  },
  'nasai': {
    name: 'Sunan an-Nasa\'i',
    description: 'A distinguished collection of hadith noted for its strict criteria, compiled by Imam an-Nasa\'i.'
  },
  'ibnmajah': {
    name: 'Sunan Ibn Majah',
    description: 'One of the six major hadith collections, compiled by Imam Ibn Majah.'
  },
  'malik': {
    name: 'Muwatta Malik',
    description: 'One of the earliest and most authoritative collections of hadith and legal rulings by Imam Malik.'
  },
  'shamail': {
    name: 'Shama\'il Muhammadiyah',
    description: 'A beautiful collection detailing the physical appearance and noble character of the Prophet (ﷺ).'
  },
  'riyadh': {
    name: 'Riyadh as-Saliheen',
    description: 'The Meadows of the Righteous; a world-renowned collection of hadith on piety and morals by Imam an-Nawawi.'
  },
  'adab': {
    name: 'Al-Adab Al-Mufrad',
    description: 'A dedicated collection focusing on Islamic etiquette and social conduct, compiled by Imam al-Bukhari.'
  }
};

const SLUG_MAP: Record<string, string> = {
  'saliheen': 'riyadh',
  'riyad-as-saliheen': 'riyadh',
  'abu-dawud': 'abudawud',
  'abi-dawud': 'abudawud',
  'an-nasai': 'nasai',
  'ibn-majah': 'ibnmajah',
};

const prisma = new PrismaClient();
const DATA_DIR = path.join(__dirname, '../data');

async function processXmlFile(filePath: string) {
  if (!fs.existsSync(filePath)) {
    console.warn(`⚠️ Warning: XML file not found: ${filePath}`);
    return;
  }

  console.log(`\n📚 Processing XML file: ${path.basename(filePath)}`);

  const fileContent = fs.readFileSync(filePath, 'utf16le');
  const $ = cheerio.load(fileContent, { xmlMode: true });

  const collectionCode = $('hadithCollection > code').text().trim();
  const collectionNameFromXml = $('hadithCollection > name').text().trim();

  if (!collectionCode) {
    console.warn(`⚠️ Warning: Could not find collection code in ${filePath}. Skipping.`);
    return;
  }

  let slug = collectionCode.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  if (SLUG_MAP[slug]) {
    slug = SLUG_MAP[slug];
  }

  const meta = COLLECTION_METADATA[slug] || {
    name: collectionNameFromXml || collectionCode,
    description: `A collection of prophetic traditions inherited from the ${collectionCode} source.`
  };

  // 1. Ensure Collection Exists
  const collection = await prisma.collection.upsert({
    where: { slug },
    update: {
      nameEnglish: meta.name,
      description: meta.description,
    },
    create: {
      slug,
      nameEnglish: meta.name,
      description: meta.description,
    },
  });
  console.log(`✅ Collection ready: ${collection.nameEnglish} (ID: ${collection.id})`);

  // 2. Parse Hadiths
  const hadithNodes = $('hadith');
  console.log(`   - Found ${hadithNodes.length} hadith entries.`);

  const BATCH_SIZE = 50;
  let processedCount = 0;

  for (let i = 0; i < hadithNodes.length; i += BATCH_SIZE) {
    const chunk = hadithNodes.slice(i, i + BATCH_SIZE);
    const hadithData: any[] = [];

    for (let j = 0; j < chunk.length; j++) {
      const node = $(chunk[j]);

      const allReferences: any[] = [];
      node.find('references > reference').each((_, refNode) => {
        const code = $(refNode).find('code').text().trim();
        const suffix = $(refNode).find('suffix').text().trim();
        const parts: string[] = [];
        $(refNode).find('parts > part').each((_, p) => {
          parts.push($(p).text().trim());
        });
        allReferences.push({ code, suffix, parts });
      });

      const primaryRef = (i + j) + 1;

      const arabicText = node.find('arabic > text').map((_, t) => $(t).text().trim()).get().join('\n');
      const englishText = node.find('english > text').map((_, t) => $(t).text().trim()).get().join('\n');

      if (!arabicText && !englishText) continue;

      const verseRefs: any[] = [];
      node.find('verseReferences > reference').each((_, vRef) => {
        verseRefs.push({
          chapter: $(vRef).find('chapter').text().trim(),
          firstVerse: $(vRef).find('firstVerse').text().trim(),
          lastVerse: $(vRef).find('lastVerse').text().trim(),
        });
      });

      const metadata: any = {
        source: 'xml_import',
        original_code: collectionCode,
        xml_references: allReferences,
      };
      if (verseRefs.length > 0) metadata.verseReferences = verseRefs;

      hadithData.push({
        collection: slug,
        collectionId: collection.id,
        bookNumber: 1,
        hadithNumber: primaryRef,
        arabicText: arabicText || '',
        englishText, // used below for translations, excluded from hadith insert
        metadata: metadata,
      });
    }

    // STEP A: Insert hadiths only (fast, no findMany inside)
    await prisma.hadith.createMany({
      data: hadithData.map(({ englishText, ...h }) => h),
      skipDuplicates: true,
    });

    // STEP B: Fetch inserted hadiths to get their IDs (outside transaction)
    const createdHadiths = await prisma.hadith.findMany({
      where: {
        collection: slug,
        bookNumber: 1,
        hadithNumber: { in: hadithData.map(h => h.hadithNumber) },
      },
      select: { id: true, hadithNumber: true },
    });

    const idMap = new Map(createdHadiths.map(h => [h.hadithNumber, h.id]));

    // STEP C: Insert translations only (fast, separate operation)
    const translations = hadithData
      .filter(h => h.englishText && idMap.has(h.hadithNumber))
      .map(h => ({
        hadithId: idMap.get(h.hadithNumber)!,
        languageCode: 'en',
        text: h.englishText,
      }));

    if (translations.length > 0) {
      await prisma.translation.createMany({
        data: translations,
        skipDuplicates: true,
      });
    }

    processedCount += chunk.length;
    process.stdout.write(`\r⏳ Processed ${processedCount}/${hadithNodes.length} ...`);
  }

  // Update total count
  await prisma.collection.update({
    where: { id: collection.id },
    data: { totalHadith: processedCount },
  });

  console.log(`\n🎉 Completed ${collectionNameFromXml}! Processed: ${processedCount}`);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length > 0) {
    for (const arg of args) {
      const filePath = path.resolve(process.cwd(), arg);
      await processXmlFile(filePath);
    }
  } else {
    console.log('🚀 Starting XML Hadiths Import Script...');
    const files = fs.readdirSync(DATA_DIR).filter((f) => f.endsWith('.xml'));
    console.log(`Found ${files.length} XML files in ${DATA_DIR} to process.`);

    for (const file of files) {
      if (file === 'Shamail-utf8.xml') continue;
      await processXmlFile(path.join(DATA_DIR, file));
    }
  }

  console.log(`\n\n✅ All files processed successfully!`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});