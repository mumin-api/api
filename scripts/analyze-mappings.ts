
const fs = require('fs');
const path = require('path');

const RUSSIAN_PARSED_FILE = 'c:/Users/Intel/Desktop/mumin/api/data/muslim_russian_parsed.json';

function main() {
    const data = JSON.parse(fs.readFileSync(RUSSIAN_PARSED_FILE, 'utf8'));
    let withPattern = 0;
    let withoutPattern = 0;
    let examples = [];

    data.forEach(item => {
        const text = item.russianText;
        // Search for (Global/Fuad) pattern
        const match = text.match(/\((\d+)\/(\d+)\)/);
        if (match) {
            withPattern++;
        } else {
            withoutPattern++;
            if (examples.length < 20) {
                examples.push({
                    mukhtasarId: item.mukhtasarId,
                    fuadBaqiId: item.fuadBaqiId,
                    text: text.substring(0, 150).replace(/\n/g, ' ') + '...'
                });
            }
        }
    });

    console.log(`Total: ${data.length}`);
    console.log(`With (Global/Fuad) pattern: ${withPattern}`);
    console.log(`Without pattern: ${withoutPattern}`);
    console.log('\nExamples without pattern:');
    console.log(JSON.stringify(examples, null, 2));
}

main();
