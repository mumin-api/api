const fs = require('fs');
const path = require('path');

const RUSSIAN_PARSED_FILE = path.join(__dirname, '../data/muslim_russian_parsed.json');
const RAW_SCRAPED_FILE = path.join(__dirname, '../data/muslim_full_raw.json');
const FINAL_OUTPUT_FILE = path.join(__dirname, '../data/muslim_full_final.json');

function main() {
    if (!fs.existsSync(RUSSIAN_PARSED_FILE)) {
        console.error(`Missing parsed Russian file: ${RUSSIAN_PARSED_FILE}`);
        return;
    }
    if (!fs.existsSync(RAW_SCRAPED_FILE)) {
        console.error(`Missing raw scraped file: ${RAW_SCRAPED_FILE}`);
        return;
    }

    const russianData = JSON.parse(fs.readFileSync(RUSSIAN_PARSED_FILE, 'utf8'));
    const rawScrapedData = JSON.parse(fs.readFileSync(RAW_SCRAPED_FILE, 'utf8'));

    console.log(`Loaded ${russianData.length} Russian hadiths and ${rawScrapedData.length} raw scraped hadiths.`);

    // Index raw data by ID for fast lookup
    const rawIdx = new Map<number, any>();
    rawScrapedData.forEach((item: any) => {
        rawIdx.set(item.id, item);
    });

    const finalData: any[] = [];
    let matchCount = 0;
    let missingArabicCount = 0;

    russianData.forEach((item: any) => {
        const arabicSource = rawIdx.get(item.fuadBaqiId);

        const mergedItem = {
            mukhtasarId: item.mukhtasarId,
            fuadBaqiId: item.fuadBaqiId,
            fuadId: item.fuadId,
            globalId: item.globalId,
            arabicText: arabicSource ? arabicSource.arabicText : '',
            russianText: item.russianText,
            bookName: item.bookName,
            chapterName: item.chapterName,
            metadata: {
                fuadBaqiReference: item.fuadBaqiId,
                originalBook: item.bookName,
                originalChapter: item.chapterName,
                globalId: item.globalId
            }
        };

        if (arabicSource) {
            matchCount++;
        } else {
            missingArabicCount++;
        }

        finalData.push(mergedItem);
    });

    fs.writeFileSync(FINAL_OUTPUT_FILE, JSON.stringify(finalData, null, 2));

    console.log(`\n🎉 Merger Complete!`);
    console.log(`✅ Total hadiths in final file: ${finalData.length}`);
    console.log(`🔗 Matched with Arabic: ${matchCount}`);
    console.log(`⚠️ Missing Arabic (using ID from Russian file): ${missingArabicCount}`);
    console.log(`💾 Saved to: ${FINAL_OUTPUT_FILE}`);
}

main();
