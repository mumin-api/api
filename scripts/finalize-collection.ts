import * as fs from 'fs';
import * as path from 'path';

function main() {
  const collectionSlug = process.argv[2];
  if (!collectionSlug) {
    console.error('Please specify a collection slug (e.g., npx ts-node scripts/finalize-collection.ts bukhari)');
    process.exit(1);
  }

  const dataDir = path.join(__dirname, '..', 'data');
  const tempPath = path.join(dataDir, `verified_${collectionSlug}_temp.json`);
  const finalPath = path.join(dataDir, `verified_${collectionSlug}.json`);

  if (!fs.existsSync(tempPath)) {
    console.error(`Verification file not found: ${tempPath}`);
    process.exit(1);
  }

  console.log(`Reading verified data for ${collectionSlug}...`);
  let data: any[] = [];
  try {
    data = JSON.parse(fs.readFileSync(tempPath, 'utf8'));
  } catch (e) {
    console.error('Failed to parse temporary JSON file.', e);
    process.exit(1);
  }

  console.log(`Total verified hadiths loaded: ${data.length}`);

  // Sort by strictly standard new ordering: book_number then hadith_number
  data.sort((a, b) => {
    // If book_number differs
    if (a.book_number !== b.book_number) {
        // Handle cases where parsing might yield string or unexpected types by coalescing 
        return (Number(a.book_number) || 0) - (Number(b.book_number) || 0);
    }
    // If book_number is same, sort by hadith_number
    return (Number(a.hadith_number) || 0) - (Number(b.hadith_number) || 0);
  });

  // Strip out db_id to make it a pure dataset
  const finalData = data.map(item => {
    const { db_id, ...pureData } = item;
    return pureData;
  });

  console.log('Stripped internal db_ids and sorted data.');

  // Save the dataset
  fs.writeFileSync(finalPath, JSON.stringify(finalData, null, 2));

  console.log(`\n✅ Finalization complete! Clean output saved to ${finalPath}`);
}

main();
