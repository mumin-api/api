import * as fs from 'fs';
import * as path from 'path';

/**
 * Merges all shard temp files into one final, sorted file.
 * Usage: npx ts-node scripts/merge-verified-shards.ts bukhari 3
 * 
 * This will merge:
 *   verified_bukhari_shard0of3_temp.json
 *   verified_bukhari_shard1of3_temp.json
 *   verified_bukhari_shard2of3_temp.json
 * 
 * Into:
 *   verified_bukhari_temp.json
 */
async function main() {
  const collectionSlug = process.argv[2];
  const totalShards = process.argv[3] ? parseInt(process.argv[3]) : 0;

  if (!collectionSlug || totalShards < 2) {
    console.error('Usage: npx ts-node scripts/merge-verified-shards.ts <collection> <totalShards>');
    console.error('Example: npx ts-node scripts/merge-verified-shards.ts bukhari 3');
    process.exit(1);
  }

  const dataDir = path.join(__dirname, '..', 'data');
  let allData: any[] = [];
  const seenIds = new Set<number>();

  for (let i = 0; i < totalShards; i++) {
    const shardFile = path.join(dataDir, `verified_${collectionSlug}_shard${i}of${totalShards}_temp.json`);
    if (!fs.existsSync(shardFile)) {
      console.warn(`⚠️  Shard file not found: ${shardFile} — skipping.`);
      continue;
    }
    const shardData: any[] = JSON.parse(fs.readFileSync(shardFile, 'utf8'));
    let added = 0;
    let dupes = 0;
    for (const item of shardData) {
      if (!seenIds.has(item.db_id)) {
        allData.push(item);
        seenIds.add(item.db_id);
        added++;
      } else {
        dupes++;
      }
    }
    console.log(`✅ Shard ${i}: ${added} hadiths added, ${dupes} duplicates skipped.`);
  }

  // Sort by db_id to keep things clean and ordered
  allData.sort((a, b) => a.db_id - b.db_id);

  const outputPath = path.join(dataDir, `verified_${collectionSlug}_temp.json`);
  const tempPath = `${outputPath}.write`;
  fs.writeFileSync(tempPath, JSON.stringify(allData, null, 2));
  fs.renameSync(tempPath, outputPath);

  console.log(`\n✅ Merged ${allData.length} hadiths into: ${outputPath}`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
