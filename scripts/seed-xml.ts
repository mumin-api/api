import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import * as cheerio from 'cheerio';

const prisma = new PrismaClient();
const DATA_DIR = path.join(__dirname, '../data');

async function processXmlFile(filePath: string) {
  if (!fs.existsSync(filePath)) {
    console.warn(`⚠️ Warning: XML file not found: ${filePath}`);
    return;
  }

  console.log(`\n📚 Processing XML file: ${path.basename(filePath)}`);

  // Read UTF-16 encoded file
  const fileContent = fs.readFileSync(filePath, 'utf16le');
  const $ = cheerio.load(fileContent, { xmlMode: true });

  const collectionCode = $('hadithCollection > code').text().trim();
  const collectionName = $('hadithCollection > name').text().trim();

  if (!collectionCode) {
    console.warn(`⚠️ Warning: Could not find collection code in ${filePath}. Skipping.`);
    return;
  }

  const slug = collectionCode.toLowerCase().replace(/[^a-z0-9]+/g, '-');

  // 1. Ensure Collection Exists
  const collection = await prisma.collection.upsert({
    where: { slug },
    update: {},
    create: {
      slug,
      nameEnglish: collectionName || collectionCode,
      description: `Collection imported from ${collectionCode} XML file.`,
    },
  });
  console.log(`✅ Collection ready: ${collection.nameEnglish} (ID: ${collection.id})`);

  // 2. Parse Hadiths
  const hadithNodes = $('hadith');
  console.log(`   - Found ${hadithNodes.length} hadith entries.`);

  let processedCount = 0;

  for (let i = 0; i < hadithNodes.length; i++) {
    const node = $(hadithNodes[i]);

    // Extract Reference Number (Primary)
    let primaryRef = 0;
    node.find('references > reference').each((_, refNode) => {
      if ($(refNode).find('code').text().trim() === 'Reference') {
        const part = $(refNode).find('parts > part').first().text().trim();
        primaryRef = parseInt(part, 10);
        return false; // break
      }
    });

    if (!primaryRef || isNaN(primaryRef)) {
      primaryRef = i + 1; // Fallback to index-based numbering
    }

    const arabicTextRows: string[] = [];
    node.find('arabic > text').each((_, t) => {
      arabicTextRows.push($(t).text().trim());
    });
    const arabicText = arabicTextRows.join('\n');

    const englishTextRows: string[] = [];
    node.find('english > text').each((_, t) => {
      englishTextRows.push($(t).text().trim());
    });
    const englishText = englishTextRows.join('\n');

    if (!arabicText && !englishText) {
      continue;
    }

    // 3. Import Data
    const bookNumber = 1; // Defaulting to 1 for flat collections
    const hadithNumber = primaryRef;

    const metadata: any = {
      source: 'xml_import',
      original_code: collectionCode,
    };

    // Extract verse references if any
    const verseRefs: any[] = [];
    node.find('verseReferences > reference').each((_, vRef) => {
      verseRefs.push({
        chapter: $(vRef).find('chapter').text().trim(),
        firstVerse: $(vRef).find('firstVerse').text().trim(),
        lastVerse: $(vRef).find('lastVerse').text().trim(),
      });
    });
    if (verseRefs.length > 0) {
      metadata.verseReferences = verseRefs;
    }

    // Create/Update Hadith
    const hadith = await prisma.hadith.upsert({
      where: {
        collection_bookNumber_hadithNumber: {
          collection: slug,
          bookNumber: bookNumber,
          hadithNumber: hadithNumber,
        },
      },
      update: {
        arabicText: arabicText || '',
        metadata: metadata,
      },
      create: {
        collection: slug,
        collectionId: collection.id,
        bookNumber: bookNumber,
        hadithNumber: hadithNumber,
        arabicText: arabicText || '',
        metadata: metadata,
      },
    });

    // Handle English Translation
    if (englishText) {
      await prisma.translation.upsert({
        where: {
          hadithId_languageCode: {
            hadithId: hadith.id,
            languageCode: 'en',
          },
        },
        update: {
          text: englishText,
        },
        create: {
          hadithId: hadith.id,
          languageCode: 'en',
          text: englishText,
        },
      });
    }

    processedCount++;
    if (processedCount % 100 === 0) {
      process.stdout.write(`\r⏳ Processed ${processedCount}/${hadithNodes.length} ...`);
    }
  }

  // Update total count
  await prisma.collection.update({
    where: { id: collection.id },
    data: { totalHadith: processedCount },
  });

  console.log(`\n🎉 Completed ${collectionName}! Processed: ${processedCount}`);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length > 0) {
    // Process specific files passed as arguments
    for (const arg of args) {
      const filePath = path.resolve(process.cwd(), arg);
      await processXmlFile(filePath);
    }
  } else {
    // Process all XML files in data directory
    console.log('🚀 Starting XML Hadiths Import Script...');
    const files = fs.readdirSync(DATA_DIR).filter((f) => f.endsWith('.xml'));
    console.log(`Found ${files.length} XML files in ${DATA_DIR} to process.`);

    for (const file of files) {
      if (file === 'Shamail-utf8.xml') continue; // Skip my temporary file
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
