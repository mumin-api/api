import * as fs from 'fs';
import * as path from 'path';
import * as cheerio from 'cheerio';

async function analyzeXml(fileName: string) {
  const filePath = path.join(__dirname, '../data', fileName);
  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    return;
  }

  console.log(`\n--- Analyzing ${fileName} ---`);
  const content = fs.readFileSync(filePath, 'utf16le');
  const $ = cheerio.load(content, { xmlMode: true });

  const hadiths = $('hadith');
  console.log(`Total hadiths in XML: ${hadiths.length}`);

  const uniqueRefs = new Set<string>();
  const intRefs = new Set<number>();
  let collisions = 0;

  hadiths.each((_, node) => {
    let primaryRef = '';
    $(node).find('references > reference').each((_, refNode) => {
      if ($(refNode).find('code').text().trim() === 'Reference') {
        const part = $(refNode).find('parts > part').first().text().trim();
        const suffix = $(refNode).find('suffix').text().trim();
        primaryRef = part + suffix;
        
        const intPart = parseInt(part, 10);
        if (intRefs.has(intPart)) {
          collisions++;
        } else {
          intRefs.add(intPart);
        }
        return false;
      }
    });

    if (primaryRef) {
      uniqueRefs.add(primaryRef);
    }
  });

  console.log(`Unique Reference strings (part+suffix): ${uniqueRefs.size}`);
  console.log(`Unique Reference integers (parseInt(part)): ${intRefs.size}`);
  console.log(`Integer collisions (rows that would be overwritten): ${collisions}`);
}

analyzeXml('Muslim.xml');
analyzeXml('Bukhari.xml');
