const fs = require('fs');
const path = require('path');

const FILES = [
    'c:/Users/Intel/Desktop/mumin/api/data/muslim/ru/al-Munziri_Muhtasar-Sahih-Muslim-1-tom_RuLit_Me.txt',
    'c:/Users/Intel/Desktop/mumin/api/data/muslim/ru/al-Munziri_Muhtasar-Sahih-Muslim-2-tom_RuLit_Me.txt'
];

const missing = [9, 17, 25, 26, 29, 37, 41, 46, 73, 126, 345, 409, 428, 479, 541, 636, 638, 641, 671, 700];

FILES.forEach(file => {
    console.log(`\nChecking ${path.basename(file)}...`);
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
        missing.forEach(id => {
            const regex = new RegExp(`(^|\\s)${id}\\.\\s*([А-ЯЁA-Z])`);
            if (regex.test(line)) {
                console.log(`L${i + 1}: Found potential Match for ID ${id}: "${line.trim().substring(0, 100)}"`);
            }
        });
    });
});
