const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../data/muslim/ru');
const FILES = [
    'al-Munziri_Muhtasar-Sahih-Muslim-1-tom_RuLit_Me.txt',
    'al-Munziri_Muhtasar-Sahih-Muslim-2-tom_RuLit_Me.txt'
];
const OUTPUT_FILE = path.join(__dirname, '../data/muslim_russian_parsed.json');

interface Hadith {
    mukhtasarId: number;
    bookName: string;
    chapterName: string;
    fuadBaqiId: number | null;
    fuadId: number | null;
    globalId: number | null;
    russianText: string;
}

function parseFile(content: string): Hadith[] {
    const hadiths: Hadith[] = [];
    const lines = content.split('\n');

    let currentBook = '';
    let currentChapter = '';
    let currentHadith: Hadith | null = null;
    let textBuffer: string[] = [];

    const bookRegex = /^\s*(?:\d+\.)?КНИГА\s+(.+)$/i;
    const chapterRegex = /^\s*Глава\s+(\d+)\.\s*(.+)$/i;

    // More robust regex:
    // Matches "123.Text" at the start of a trimmed line
    const hadithStartRegex = /^(\d+)\.\s*(.+)/;

    const refRegex = /\((\d+)\s*\/\s*(\d+)\)/g;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        // Skip page numbers
        if (/^\d{1,3}$/.test(line)) continue;

        const bookMatch = line.match(bookRegex);
        if (bookMatch && line.includes('КНИГА')) {
            currentBook = line;
            continue;
        }

        const chapterMatch = line.match(chapterRegex);
        if (chapterMatch) {
            currentChapter = line;
            continue;
        }

        const hadithStartMatch = line.match(hadithStartRegex);
        if (hadithStartMatch) {
            const hNum = parseInt(hadithStartMatch[1]);

            // Save previous hadith
            if (currentHadith && textBuffer.length > 0) {
                let fullText = textBuffer.join(' ').replace(/\s+/g, ' ');

                // Extract all references
                const refs: { globalId: number; fuadId: number }[] = [];
                let match: RegExpExecArray | null;
                while ((match = refRegex.exec(fullText)) !== null) {
                    refs.push({
                        globalId: parseInt(match[1]),
                        fuadId: parseInt(match[2])
                    });
                }

                if (refs.length > 0) {
                    // Use the last reference found (usually the one at the end of the hadith)
                    const lastRef = refs[refs.length - 1];
                    currentHadith.globalId = lastRef.globalId;
                    currentHadith.fuadId = lastRef.fuadId;
                    currentHadith.fuadBaqiId = lastRef.fuadId; // Keep for compatibility

                    // Clean text from ALL references found
                    currentHadith.russianText = fullText.replace(refRegex, '').replace(/\s+\.?\s*$/, '').trim();
                } else {
                    currentHadith.russianText = fullText.trim();
                }
                hadiths.push(currentHadith);
            }

            // Start new hadith
            currentHadith = {
                mukhtasarId: hNum,
                bookName: currentBook,
                chapterName: currentChapter,
                fuadBaqiId: null,
                fuadId: null,
                globalId: null,
                russianText: ''
            };
            textBuffer = [line];
            continue;
        }

        if (currentHadith) {
            textBuffer.push(line);
        }
    }

    // Final Hadith
    if (currentHadith && textBuffer.length > 0) {
        let fullText = textBuffer.join(' ').replace(/\s+/g, ' ');
        const refs: { globalId: number; fuadId: number }[] = [];
        let match: RegExpExecArray | null;
        while ((match = refRegex.exec(fullText)) !== null) {
            refs.push({
                globalId: parseInt(match[1]),
                fuadId: parseInt(match[2])
            });
        }

        if (refs.length > 0) {
            const lastRef = refs[refs.length - 1];
            currentHadith.globalId = lastRef.globalId;
            currentHadith.fuadId = lastRef.fuadId;
            currentHadith.fuadBaqiId = lastRef.fuadId;
            currentHadith.russianText = fullText.replace(refRegex, '').replace(/\s+\.?\s*$/, '').trim();
        } else {
            currentHadith.russianText = fullText.trim();
        }
        hadiths.push(currentHadith);
    }

    return hadiths;
}

function main() {
    let allParsed: Hadith[] = [];

    for (const fileName of FILES) {
        const filePath = path.join(DATA_DIR, fileName);
        if (!fs.existsSync(filePath)) {
            console.error(`File not found: ${filePath}`);
            continue;
        }
        console.log(`Parsing ${fileName}...`);
        const content = fs.readFileSync(filePath, 'utf8');
        const parsed = parseFile(content);
        console.log(`Found ${parsed.length} raw hadith markers.`);
        allParsed = allParsed.concat(parsed);
    }

    const uniqueMap = new Map<number, Hadith>();
    for (const h of allParsed) {
        if (!uniqueMap.has(h.mukhtasarId)) {
            uniqueMap.set(h.mukhtasarId, h);
        } else {
            const existing = uniqueMap.get(h.mukhtasarId)!;

            // Score based on ID presence
            const getScore = (item: Hadith) => {
                let s = 0;
                if (item.fuadId) s += 2;
                if (item.globalId) s += 2;
                if (item.fuadBaqiId) s += 1;
                return s;
            };

            const hScore = getScore(h);
            const eScore = getScore(existing);

            if (hScore > eScore) {
                uniqueMap.set(h.mukhtasarId, h);
            } else if (hScore === eScore) {
                // If same content score, prefer SHORTER text 
                // because longer text likely means multiple hadiths were merged.
                if (h.russianText.length < existing.russianText.length && h.russianText.length > 50) {
                    uniqueMap.set(h.mukhtasarId, h);
                }
            }
        }
    }

    const uniqueHadiths = Array.from(uniqueMap.values());
    uniqueHadiths.sort((a, b) => a.mukhtasarId - b.mukhtasarId);

    console.log(`Max ID found: ${uniqueHadiths[uniqueHadiths.length - 1].mukhtasarId}`);

    // Check for gaps
    const missing = [];
    const ids = uniqueHadiths.map(h => h.mukhtasarId);
    for (let i = 1; i <= uniqueHadiths[uniqueHadiths.length - 1].mukhtasarId; i++) {
        if (!uniqueMap.has(i)) missing.push(i);
    }
    if (missing.length > 0) {
        console.log(`Missing IDs (${missing.length}): ${missing.slice(0, 20).join(', ')}...`);
    }

    const outputDir = path.dirname(OUTPUT_FILE);
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(uniqueHadiths, null, 2));
    console.log(`Successfully saved ${uniqueHadiths.length} unique hadiths to ${OUTPUT_FILE}`);
}

main();
