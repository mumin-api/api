import axios from 'axios';
import * as cheerio from 'cheerio';
import * as fs from 'fs';
import * as path from 'path';

const BASE_URL = 'https://hadis.uk';
const DATA_DIR = path.join(__dirname, '../data');
const OUTPUT_FILE = path.join(DATA_DIR, 'muslim_full_raw.json');
const PROGRESS_FILE = path.join(DATA_DIR, 'scraping_progress.json');

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'ru-RU,ru;q=0.9,en;q=0.8',
    'Connection': 'keep-alive',
    'Referer': BASE_URL,
};

const AXIOS_CONFIG = {
    timeout: 30000,
    maxRedirects: 5,
};

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

interface HadithData {
    id: number;
    arabicText: string;
    russianText: string;
    bookName: string;
    chapterName?: string;
    url: string;
}

async function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function getAllBooks(): { title: string; url: string }[] {
    return [
        { title: 'Вступление', url: `${BASE_URL}/001-vstuplenie-xadisy-1-4/223/` },
        { title: '1. Книга веры. Хадисы № 8-222', url: `${BASE_URL}/001-kniga-very/359/` },
        { title: '2. Книга очищения. Хадисы № 223-292', url: `${BASE_URL}/03-kniga-ochishheniya-3/744/` },
        { title: '3. Книга месячных. Хадисы № 293-376', url: `${BASE_URL}/04-kniga-mesyachnyx/746/` },
        { title: '4. Книга молитвы. Хадисы № 377-519', url: `${BASE_URL}/05-kniga-molitvy/747/` },
        { title: '5. Книга о мечетях. Хадисы № 520-684', url: `${BASE_URL}/06-kniga-o-mechetyax-i-mestax-molitvy/751/` },
        { title: '6. Книга о молитве путника. Хадисы № 685-843', url: `${BASE_URL}/06-kniga-o-molitve-putnika-i-o-ee-sokrashhe/765/` },
        { title: '7. Книга пятницы. Хадисы № 844-883', url: `${BASE_URL}/07-kniga-pyatnicy/767/` },
        { title: '8. Книга праздничных молитв. Хадисы № 884-893', url: `${BASE_URL}/08-kniga-prazdnichnyx-molitv/769/` },
        { title: '9. Молитва о дожде. Хадисы № 894-900', url: `${BASE_URL}/09-kniga-molitva-s-prosboj-o-nisposlan/772/` },
        { title: '10. Книга затмения. Хадисы № 901-915', url: `${BASE_URL}/10-kniga-molitva-po-sluchayu-zatmenij-sol/774/` },
        { title: '11. Книга похорон. Хадисы № 916-978', url: `${BASE_URL}/11-kniga-poxoron/776/` },
        { title: '12. Книга закята. Хадисы № 979-1078', url: `${BASE_URL}/12-kniga-zakyata/779/` },
        { title: '13. Книга поста. Хадисы № 1079-1170', url: `${BASE_URL}/13-kniga-posta/781/` },
        { title: '15. Книга хаджжа. Хадисы № 1177-1399', url: `${BASE_URL}/15-kniga-xadzhzha/786/` },
        { title: '16. Книга брака. Хадисы № 1400-1443', url: `${BASE_URL}/16-kniga-brakosochetaniya/788/` },
        { title: '17. Книга о кормлении грудью. Хадисы № 1444-1470', url: `${BASE_URL}/17-kniga-molochnogo-rodstva/790/` },
        { title: '18. Книга о разводе. Хадисы № 1471-1491', url: `${BASE_URL}/18-kniga-o-razvode-suprugov/793/` },
        { title: '19. Книга о лиан. Хадисы № 1492-1500', url: `${BASE_URL}/19-kniga-o-vzaimnom-proklyatii-suprugov/795/` },
        { title: '20. Книга об освобождении рабов. Хадисы № 1501-1510', url: `${BASE_URL}/20-kniga-ob-osvobozhdenii-rabov/798/` },
        { title: '21. Книга продаж. Хадисы № 1511-1550', url: `${BASE_URL}/21-kniga-prodazh/801/` },
        { title: '22. Книга об орошении. Хадисы № 1551-1613', url: `${BASE_URL}/22-kniga-ob-oroshenii/804/` },
        { title: '23. Книга о долях наследства. Хадисы № 1614-1619', url: `${BASE_URL}/23-kniga-o-dolyax-nasledstva/809/` },
        { title: '24. Книга о дарах. Хадисы № 1620-1626', url: `${BASE_URL}/24-kniga-o-darax/811/` },
        { title: '25. Книга завещания. Хадисы № 1627-1637', url: `${BASE_URL}/25-kniga-zaveshhaniya/814/` },
        { title: '26. Книга обета. Хадисы № 1638-1645', url: `${BASE_URL}/26-kniga-obeta/817/` },
        { title: '27. Книга клятв. Хадисы № 1646-1668', url: `${BASE_URL}/27-kniga-klyatv/820/` },
        { title: '28. Книга о клятвах. Хадисы № 1669-1689', url: `${BASE_URL}/28-kniga/823/` },
        { title: '29. Книга заповедей. Хадисы № 1690-1710', url: `${BASE_URL}/29-kniga-zapovedej/826/` },
        { title: '30. Книга о судействе. Хадисы № 1711-1721', url: `${BASE_URL}/30-kniga-o-sudejstve/831/` },
        { title: '31. Книга о находке. Хадисы № 1722-1729', url: `${BASE_URL}/31-kniga-o-naxodke/834/` },
        { title: '32. Книга джихада. Хадисы № 1730-1817', url: `${BASE_URL}/32-kniga-dzhixada-i-voennyx-poxodov/837/` },
        { title: '33. Книга о правлении. Хадисы № 1818-1928', url: `${BASE_URL}/saxix-muslim-33-kniga-o-pravlenii-xadisy-1818-1928/26467/` },
        { title: '34. Книга об охоте. Хадисы № 1929-1959', url: `${BASE_URL}/34-kniga-ob-oxote-zakalyvanii-i-o-tom-chto/842/` },
        { title: '35. Книга о жертвоприношениях. Хадисы № 1960-1978', url: `${BASE_URL}/35-kniga-o-zhertvoprinosheniyax/845/` },
        { title: '36. Книга о напитках. Хадисы № 1979-2064', url: `${BASE_URL}/36-kniga-o-napitkax/847/` },
        { title: '37. Книга об одежде. Хадисы № 2065-2130', url: `${BASE_URL}/37-kniga-ob-odezhde-i-ukrasheniyax/850/` },
        { title: '38. Книга благовоспитанности. Хадисы №№ 2131-2159', url: `${BASE_URL}/38-kniga-o-blagovospitannosti/852/` },
        { title: '39. Книга о приветствии. Хадисы № 2160-2245', url: `${BASE_URL}/39-kniga-o-privetstviisalyam/855/` },
        { title: '40. Книга выражений. Хадисы № 2246-2254', url: `${BASE_URL}/40-kniga-vyrazhenij-ob-etiketax-i-prochee/857/` },
        { title: '42. Книга сновидений. Хадисы № 2261-2275', url: `${BASE_URL}/42-kniga-snovidenij/863/` },
        { title: '43. Книга достоинств. Хадисы № 2276-2380', url: `${BASE_URL}/43-kniga-dostoinstv/865/` },
        { title: '44. Книга о сподвижниках. Хадисы № 2381-2547', url: `${BASE_URL}/44-kniga-o-dostoinstvax-spodvizhnikov-d/867/` },
        { title: '45. Книга благочестия. Хадисы № 2548-2642', url: `${BASE_URL}/45-kniga-blagochestiya-rodstvennyx-svyaze/869/` },
        { title: '46. Книга о предопределении. Хадисы №2643-2664', url: `${BASE_URL}/46-kniga-o-predopredelenii/873/` },
        { title: '47. Книга знания. Хадисы № 2665-2674', url: `${BASE_URL}/47-kniga-znaniya/875/` },
        { title: '48. Книга поминания Аллаха. Хадисы № 2675-2743', url: `${BASE_URL}/48-kniga-pominaniya-allaxazikr-molbyd/877/` },
        { title: '49. Книга покаяния. Хадисы № 2744-2771', url: `${BASE_URL}/49-kniga-pokayaniya/880/` },
        { title: '50. Книга о лицемерах. Хадисы №2772-2784', url: `${BASE_URL}/50-kniga-o-kachestvax-licemerov-i-suzhden/884/` },
        { title: '51. Книга о рае. Хадисы № 2822-2879', url: `${BASE_URL}/51-kniga-priznakov-sudnogo-dnya-raya-i-ada/886/` },
        { title: '52. Книга испытаний. Хадисы № 2880-2955', url: `${BASE_URL}/52-kniga-ispytanij-i-priznakov-sudnogo/894/` },
        { title: '53. Книга аскетизма. Хадисы № 2956-3014', url: `${BASE_URL}/53-kniga-asketizmazuxd-i-smyagcheniya-ser/896/` },
        { title: '54. Книга толкования Корана. Хадисы № 3015-3033', url: `${BASE_URL}/54-kniga-tolkovaniya-koranatafsir/899/` },
    ];
}

// Находим подстраницы на странице-оглавлении
async function findSubPages(url: string): Promise<string[]> {
    try {
        const { data } = await axios.get(url, { headers: HEADERS, ...AXIOS_CONFIG });
        const $ = cheerio.load(data);
        
        const subPages: string[] = [];
        
        // Ищем ссылки вида "Хадисы № 8-100", "Хадисы №№ 101-200"
        $('.entry-content a, .post-content a, article a').each((_, el) => {
            const href = $(el).attr('href');
            const text = $(el).text().trim();
            
            if (href && text.match(/Хадисы?\s*№/i)) {
                const fullUrl = href.startsWith('http') ? href : `${BASE_URL}${href}`;
                if (fullUrl.includes('hadis.uk') && !subPages.includes(fullUrl)) {
                    subPages.push(fullUrl);
                }
            }
        });
        
        return subPages;
    } catch (e) {
        return [];
    }
}

async function parseHadithsFromPage(url: string, bookTitle: string): Promise<HadithData[]> {
    const { data: content } = await axios.get(url, { headers: HEADERS, ...AXIOS_CONFIG });
    const $ = cheerio.load(content);
    
    const hadiths: HadithData[] = [];
    let currentId: number | null = null;
    let currentArabic: string[] = [];
    let currentRussian: string[] = [];
    let currentChapter: string | undefined;
    
    $('.entry-content, .post-content').find('p, h3, h4, h5, h6, strong, b').each((_, el) => {
        const $el = $(el);
        const text = $el.text().trim();
        
        if (!text || text.length < 3) return;
        
        // Глава
        if (text.match(/^\d+\s*[–—-]\s*(?:Глава|баб)/i) && text.length < 300) {
            const chapterMatch = text.match(/(?:Глава|баб)[:\s]+(.+)/i);
            if (chapterMatch) currentChapter = chapterMatch[1].trim();
            return;
        }
        
        // ID хадиса
        const patterns = [
            /^(\d+)\s*[–—-]\s*\(\s*(\d+)\s*\)/,
            /^\*\*(\d+)\s*[–—-]\s*\(\s*(\d+)\s*\)\*\*/,
            /^\*\*(\d+)\s*[–—-]\*\*/,
            /^(\d+)\s*[–—-]\s*[^(]/,
            /^Хадис\s*№?\s*(\d+)/i,
        ];
        
        let foundId: number | null = null;
        for (const pattern of patterns) {
            const match = text.match(pattern);
            if (match) {
                const id = parseInt(match[2] || match[1]);
                if (!isNaN(id) && id > 0 && id < 10000) {
                    foundId = id;
                    break;
                }
            }
        }
        
        if (foundId && foundId !== currentId) {
            if (currentId !== null && currentRussian.length > 0) {
                hadiths.push({
                    id: currentId,
                    arabicText: currentArabic.join(' ').trim(),
                    russianText: currentRussian.join('\n\n').trim(),
                    bookName: bookTitle,
                    chapterName: currentChapter,
                    url,
                });
            }
            
            currentId = foundId;
            currentArabic = [];
            currentRussian = [];
            return;
        }
        
        if (currentId === null) return;
        
        const hasArabic = /[\u0600-\u06FF]/.test(text);
        const isRTL = $el.attr('dir') === 'rtl' || $el.parent().attr('dir') === 'rtl';
        
        if (hasArabic || isRTL) {
            if (text.length > 10) currentArabic.push(text);
        } else {
            const isNoise = 
                text.match(/^\[\d+\]/) ||
                text.match(/^Глава\s+\d+/i) ||
                text.match(/^Также этот хадис/i) ||
                text.match(/^См\.\s+«/i) ||
                text.match(/^Этот хадис передал/i) && text.length < 100 ||
                text.startsWith('---') ||
                text.length < 25;
            
            if (!isNoise) currentRussian.push(text);
        }
    });
    
    if (currentId !== null && currentRussian.length > 0) {
        hadiths.push({
            id: currentId,
            arabicText: currentArabic.join(' ').trim(),
            russianText: currentRussian.join('\n\n').trim(),
            bookName: bookTitle,
            chapterName: currentChapter,
            url,
        });
    }
    
    return hadiths;
}

async function scrape(): Promise<void> {
    console.log('🚀 Парсер Сахих Муслим v5 - С автопоиском подстраниц!');
    console.log('='.repeat(60));
    
    try {
        const books = getAllBooks();
        console.log(`📚 Всего книг: ${books.length}\n`);
        
        let processedUrls: string[] = [];
        if (fs.existsSync(PROGRESS_FILE)) {
            processedUrls = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
        }
        
        let allHadiths: HadithData[] = [];
        if (fs.existsSync(OUTPUT_FILE)) {
            try {
                allHadiths = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8'));
                console.log(`📜 Загружено ${allHadiths.length} хадисов\n`);
            } catch {
                console.log('🆕 Старт с нуля\n');
            }
        }
        
        let successCount = 0;
        let errorCount = 0;
        let totalSubPages = 0;
        
        for (let i = 0; i < books.length; i++) {
            const { title, url } = books[i];
            
            console.log(`\n[${i+1}/${books.length}] ${title}`);
            console.log(`🔗 ${url}`);
            
            // Ищем подстраницы
            console.log('   🔍 Ищем подстраницы...');
            const subPages = await findSubPages(url);
            
            // Если подстраниц нет - парсим саму страницу
            const pagesToParse = subPages.length > 0 ? subPages : [url];
            
            if (subPages.length > 0) {
                console.log(`   📄 Найдено подстраниц: ${subPages.length}`);
                totalSubPages += subPages.length;
            }
            
            for (let j = 0; j < pagesToParse.length; j++) {
                const pageUrl = pagesToParse[j];
                
                if (processedUrls.includes(pageUrl)) {
                    console.log(`   ⏭️  [${j+1}/${pagesToParse.length}] Уже обработано`);
                    continue;
                }
                
                console.log(`   📖 [${j+1}/${pagesToParse.length}] Парсим...`);
                
                let attempts = 0;
                let newHadiths: HadithData[] = [];
                
                while (attempts < 3 && newHadiths.length === 0) {
                    attempts++;
                    if (attempts > 1) {
                        const delay = attempts * 5000;
                        console.log(`      🔄 Попытка ${attempts}/3 (пауза ${delay/1000}с)...`);
                        await sleep(delay);
                    }
                    
                    try {
                        newHadiths = await parseHadithsFromPage(pageUrl, title);
                        
                        if (newHadiths.length > 0) {
                            console.log(`      ✅ Найдено ${newHadiths.length} хадисов`);
                            successCount++;
                        } else {
                            console.log('      ⚠️  Хадисы не найдены');
                        }
                    } catch (e: any) {
                        const isConnectionError = e.code === 'ECONNRESET' || 
                                                 e.code === 'ETIMEDOUT';
                        
                        if (isConnectionError) {
                            console.error(`      ❌ Проблема соединения: ${e.code}`);
                        } else {
                            console.error(`      ❌ Ошибка: ${e.message}`);
                        }
                        
                        if (attempts === 3) {
                            errorCount++;
                            console.log('      💀 Пропускаем');
                        }
                    }
                }
                
                let addedCount = 0;
                newHadiths.forEach(h => {
                    if (!allHadiths.some(existing => existing.id === h.id)) {
                        allHadiths.push(h);
                        addedCount++;
                    }
                });
                
                if (addedCount > 0) {
                    console.log(`      ✨ +${addedCount} | Всего: ${allHadiths.length}`);
                }
                
                processedUrls.push(pageUrl);
                await sleep(2000 + Math.random() * 2000);
            }
            
            if ((i + 1) % 5 === 0 || i === books.length - 1) {
                fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allHadiths, null, 2));
                fs.writeFileSync(PROGRESS_FILE, JSON.stringify(processedUrls, null, 2));
                console.log('   💾 Прогресс сохранён');
            }
        }
        
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allHadiths, null, 2));
        fs.writeFileSync(PROGRESS_FILE, JSON.stringify(processedUrls, null, 2));
        
        console.log('\n' + '='.repeat(60));
        console.log('🎉 ПАРСИНГ ЗАВЕРШЁН!');
        console.log(`📄 Всего подстраниц обработано: ${totalSubPages}`);
        console.log(`✅ Успешно: ${successCount} страниц`);
        console.log(`❌ Ошибки: ${errorCount} страниц`);
        console.log(`📊 Всего хадисов: ${allHadiths.length}`);
        console.log(`💾 Файл: ${OUTPUT_FILE}`);
        
        const ids = allHadiths.map(h => h.id).sort((a, b) => a - b);
        const gaps: number[] = [];
        for (let i = 1; i < ids.length; i++) {
            for (let missing = ids[i-1] + 1; missing < ids[i]; missing++) {
                gaps.push(missing);
            }
        }
        
        if (gaps.length > 0) {
            console.log(`\n⚠️  Пропуски: ${gaps.slice(0, 30).join(', ')}${gaps.length > 30 ? '...' : ''}`);
            console.log(`   Всего: ${gaps.length} хадисов`);
        } else {
            console.log('\n✅ Пропусков нет!');
        }
        
        console.log('\n💪 Готово для Supabase! За умму, ин ша Аллах!');
        
    } catch (error: any) {
        console.error('💥 Критическая ошибка:', error.message);
    }
}

if (require.main === module) {
    scrape();
}