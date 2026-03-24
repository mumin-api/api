import { PrismaClient } from '@prisma/client';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import * as fs from 'fs';
import * as path from 'path';
import * as cliProgress from 'cli-progress';
import * as dotenv from 'dotenv';

// Load .env variables
dotenv.config();

const prisma = new PrismaClient();

// Configuration
const MODELS = [
  'gemini-3.1-flash-lite-preview'
];

// Throttling: default 4s between requests to respect common quotas
const PROCESS_DELAY = parseInt(process.env.PROCESS_DELAY || '5000');

async function main() {
  const collectionSlug = process.argv[2];
  if (!collectionSlug) {
    console.error('Usage: npx ts-node verify-hadiths-ai.ts <collection> [shardIndex] [totalShards]');
    console.error('Example (single):  npx ts-node verify-hadiths-ai.ts bukhari');
    console.error('Example (3-way):   npx ts-node verify-hadiths-ai.ts bukhari 0 3');
    process.exit(1);
  }

  // Sharding support: split hadiths across parallel terminal instances
  const shardIndex = process.argv[3] !== undefined ? parseInt(process.argv[3]) : 0;
  const totalShards = process.argv[4] !== undefined ? parseInt(process.argv[4]) : 1;

  if (shardIndex >= totalShards) {
    console.error(`shardIndex (${shardIndex}) must be less than totalShards (${totalShards}).`);
    process.exit(1);
  }

  // Parse ALL keys, then assign this shard its own slice of keys
  const allKeys = (process.env.VECTOR_API_KEY || '').split(',').map(k => k.trim()).filter(k => k.length > 0);
  if (allKeys.length === 0) {
    console.error('No Gemini API keys found in VECTOR_API_KEY.');
    process.exit(1);
  }

  // Divide keys evenly among shards so they never overlap
  const keysPerShard = Math.ceil(allKeys.length / totalShards);
  const API_KEYS = allKeys.slice(shardIndex * keysPerShard, (shardIndex + 1) * keysPerShard);
  if (API_KEYS.length === 0) {
    console.error(`No keys assigned to shard ${shardIndex}. Consider reducing totalShards.`);
    process.exit(1);
  }

  const shardLabel = totalShards > 1 ? `_shard${shardIndex}of${totalShards}` : '';
  
  // Diagnostic: Print LAST 4 chars of each assigned key
  const keySuffixes = API_KEYS.map(k => '...' + k.slice(-4));
  console.log(`[Shard ${shardIndex + 1}/${totalShards}] System total keys: ${allKeys.length}`);
  console.log(`[Shard ${shardIndex + 1}/${totalShards}] Assigned Keys: ${keySuffixes.join(', ')}`);
  
  // Duplicate check
  const uniqueInShard = new Set(API_KEYS).size;
  if (uniqueInShard < API_KEYS.length) {
    console.warn(`[WARNING] Shard ${shardIndex + 1} has duplicate keys in its assignment! Check your .env.`);
  }

  console.log(`[Shard ${shardIndex + 1}/${totalShards}] Keys Count: ${API_KEYS.length}, Models: ${MODELS.length}, Delay: ${PROCESS_DELAY}ms`);

  const outputDir = path.join(__dirname, '..', 'data');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const scriptOutputDir = path.join(__dirname, 'output');
  if (!fs.existsSync(scriptOutputDir)) {
     fs.mkdirSync(scriptOutputDir, { recursive: true });
  }

  const outputPath = path.join(outputDir, `verified_${collectionSlug}${shardLabel}_temp.json`);
  const failedPath = path.join(scriptOutputDir, `failed_${collectionSlug}${shardLabel}.json`);

  let processedData: any[] = [];
  let processedIds = new Set<number>();

  // Load processed data
  if (fs.existsSync(outputPath)) {
    try {
      processedData = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
      processedData.forEach(item => {
        if (item.db_id) processedIds.add(item.db_id);
      });
    } catch (e) {
      console.error('Error reading output file. Starting fresh.', e);
    }
  }

  // Load failed data
  let failedData: any[] = [];
  if (fs.existsSync(failedPath)) {
    try {
      failedData = JSON.parse(fs.readFileSync(failedPath, 'utf8'));
    } catch (e) {
      console.warn('Could not read existing failed.json');
    }
  }

  console.log(`Resuming ${collectionSlug}. Already processed: ${processedIds.size}. Existing failures: ${failedData.length}`);

  // Fetch ALL hadiths, then slice this shard's portion
  const allHadiths = await prisma.hadith.findMany({
    where: { 
      collectionRef: { slug: collectionSlug } 
    },
    include: {
      translations: true
    },
    orderBy: [
      { bookNumber: 'asc' },
      { hadithNumber: 'asc' }
    ]
  });

  if (allHadiths.length === 0) {
    console.error(`No hadiths found for collection: ${collectionSlug}`);
    process.exit(1);
  }

  // Deterministically slice hadiths for this shard
  const chunkSize = Math.ceil(allHadiths.length / totalShards);
  const myHadiths = allHadiths.slice(shardIndex * chunkSize, (shardIndex + 1) * chunkSize);

  // Filter out ALREADY PROCESSED and ALREADY FAILED (if you want to skip them)
  const failedIds = new Set(failedData.map(f => f.db_id));
  const remainingHadiths = myHadiths.filter(h => !processedIds.has(h.id) && !failedIds.has(h.id));

  console.log(`Total: ${allHadiths.length} | Shard slice: ${myHadiths.length} | Remaining: ${remainingHadiths.length}`);

  if (remainingHadiths.length === 0) {
    console.log('All hadiths are already processed or failed!');
    process.exit(0);
  }

  const progressBar = new cliProgress.SingleBar({
    format: `[Shard ${shardIndex}] {bar} | {percentage}% | {value}/{total} | Model: {model} | Key: {keyIdx}/{keyTotal}`,
    barCompleteChar: '\u2588',
    barIncompleteChar: '\u2591',
    hideCursor: true
  }, cliProgress.Presets.shades_classic);

  progressBar.start(remainingHadiths.length, 0, { model: MODELS[0], keyIdx: 1, keyTotal: API_KEYS.length });

  let keyIndex = 0;
  let modelIndex = 0;

  for (let i = 0; i < remainingHadiths.length; i++) {
    const hadith = remainingHadiths[i];
    let success = false;
    let retries = 0;
    const maxRetriesPerCombo = 3;

    while (!success) {
      const currentKey = API_KEYS[keyIndex];
      const currentModel = MODELS[modelIndex];

      progressBar.update(i, { model: currentModel, keyIdx: keyIndex + 1, keyTotal: API_KEYS.length });
      const enTranslation = hadith.translations.find(t => t.languageCode === 'en')?.text || '';

      let textResult = ''; // Scope it here
      
      try {
        const genAI = new GoogleGenerativeAI(currentKey);
        const model = genAI.getGenerativeModel({ 
            model: currentModel,
            generationConfig: { responseMimeType: 'application/json' },
            safetySettings: [
              { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
              { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
              { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
              { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
            ]
        });

       const prompt = `You are a Hadith expert specializing in classical Islamic texts. Below is an Arabic hadith from the '${collectionSlug}' collection.

Your task is to identify this EXACT hadith and provide its correct metadata.

Arabic text:
${hadith.arabicText}

Cross-reference hint (English translation already in the database - use this to confirm you identified the CORRECT hadith):
${enTranslation}

Instructions:
1. Using BOTH the Arabic text AND the English hint above, identify this exact hadith.
2. Determine its exact standard hadith number from the classical numbering system (e.g., Fath al-Bari for Sahih al-Bukhari). DO NOT use the sequential database number. Find the TRUE classical number.
3. Determine the Book Number and Book Name it belongs to.
4. Provide a professional, literary Russian translation of the MATN. 
5. CRITICAL FOR JSON VALIDITY: Use only Russian chevron quotes (« ») for any speech or quotes inside the Russian translation. Never use double quotes (") inside the translation text.
6. Return ONLY a pure JSON object. DO NOT use markdown code blocks. DO NOT add explanatory text. 

The response MUST be a valid JSON object following this EXACT format:
{
  "book_number": 2,
  "book_name": {
    "ar": "كتاب الإيمان",
    "en": "The Book of Faith",
    "ru": "Книга веры"
  },
  "hadith_number": 456,
  "russian_translation": "Здесь ваш текст с использованием «ёлочек» для цитат"
}`;

        const result = await model.generateContent(prompt);
        textResult = result.response.text();
        
        // Cleanup potential markdown blocks if AI ignored instruction
        textResult = textResult.replace(/^```[a-z]*\s*/i, '').replace(/\s*```$/i, '').trim();
        
        let parsed;
        try {
            parsed = JSON.parse(textResult);
        } catch (e: any) {
            // Handle cases where AI response was blocked or malformed despite safetySettings
            if (textResult.includes('PROHIBITED') || textResult.includes('SAFETY') || textResult === '') {
                console.log(`\n[WARNING] DB ID ${hadith.id} was BLOCKED by safety filters.`);
                parsed = {
                   book_number: 0,
                   book_name: { ar: "BLOCKED", en: "BLOCKED", ru: "ЗАБЛОКИРОВАНО" },
                   hadith_number: 0,
                   russian_translation: "Текст заблокирован фильтрами безопасности ИИ."
                };
            } else {
                console.log(`\n[PARSE ERROR] AI returned malformed JSON for DB ID ${hadith.id}. Raw start: ${textResult.slice(0, 50)}...`);
                throw e; // Standard JSON parse error
            }
        }

        const finalObject = {
          db_id: hadith.id,
          book_number: parsed.book_number,
          book_name: parsed.book_name,
          hadith_number: parsed.hadith_number,
          arabic: hadith.arabicText,
          english_translation: enTranslation,
          russian_translation: parsed.russian_translation
        };

        processedData.push(finalObject);
        processedIds.add(hadith.id);
        processedData.sort((a, b) => a.db_id - b.db_id);

        const tempWritePath = `${outputPath}.write`;
        fs.writeFileSync(tempWritePath, JSON.stringify(processedData, null, 2));
        fs.renameSync(tempWritePath, outputPath);

        success = true;
        await new Promise(res => setTimeout(res, PROCESS_DELAY)); 

      } catch (error: any) {
        retries++;
        const keySuffix = currentKey ? currentKey.slice(-4) : 'NONE';
        const errMsg = error.message || 'Unknown Error';
        const isParsingError = error instanceof SyntaxError || errMsg.includes('JSON') || errMsg.includes('Unexpected token');
        const status = isParsingError ? 'PARSE_ERROR' : (error.status || (errMsg.includes('429') ? 429 : errMsg.includes('404') ? 404 : 500));

        console.log(`\n[${status}] Key ...${keySuffix} | Model: ${currentModel} | Msg: ${errMsg.slice(0, 100)}`);
        
        if (status === 429 || errMsg.includes('quota') || status === 404 || errMsg.includes('SAFETY') || errMsg.includes('PROHIBITED') || isParsingError) {
          
          if (errMsg.includes('SAFETY') || errMsg.includes('PROHIBITED')) {
             console.log(`[SAFETY BLOCK] DB ID ${hadith.id} marked as BLOCKED.`);
             const finalObject = {
              db_id: hadith.id,
              book_number: 0,
              book_name: { ar: "BLOCKED", en: "BLOCKED", ru: "ЗАБЛОКИРОВАНО" },
              hadith_number: 0,
              arabic: hadith.arabicText,
              english_translation: enTranslation,
              russian_translation: "Текст заблокирован фильтрами безопасности ИИ."
            };
            processedData.push(finalObject);
            processedIds.add(hadith.id);
            fs.writeFileSync(outputPath + '.write', JSON.stringify(processedData, null, 2));
            fs.renameSync(outputPath + '.write', outputPath);
            success = true;
            continue; 
          }

          // In case of quota or parse error, switch model/key
          modelIndex++;
          if (modelIndex >= MODELS.length) {
            modelIndex = 0;
            keyIndex++;
            if (keyIndex >= API_KEYS.length) {
              // FULL CYCLE EXHAUSTED
              if (isParsingError || status === 500) {
                 // If it's a persistent error across ALL keys, it's likely a bad hadith/prompt
                 console.error(`\n[FATAL] Hadith ${hadith.id} failed ALL keys/models. Logging to failed.json.`);
                 failedData.push({
                    db_id: hadith.id,
                    error: errMsg,
                    raw_response: textResult || 'EMPTY',
                    model: currentModel,
                    timestamp: new Date().toISOString()
                 });
                 fs.writeFileSync(failedPath, JSON.stringify(failedData, null, 2));
                 break; // Skip to next hadith
              }

              keyIndex = 0;
              progressBar.stop();
              console.log('\n' + '='.repeat(50));
              console.log('🛑 QUOTA EXHAUSTED FOR ALL KEYS');
              console.log(`Time: ${new Date().toLocaleTimeString()}`);
              console.log('Waiting 60 seconds before next rotation cycle...');
              console.log('='.repeat(50) + '\n');
              await new Promise(res => setTimeout(res, 60000));
              progressBar.start(remainingHadiths.length, i, { model: MODELS[modelIndex], keyIdx: keyIndex + 1, keyTotal: API_KEYS.length });
            }
          }
          retries = 0; 
        } 
        else {
           // Unknown error or syntax error that hasn't exhausted keys yet
           if (retries >= maxRetriesPerCombo) {
              modelIndex++; // Switch model to try to recover
              if (modelIndex >= MODELS.length) {
                  modelIndex = 0;
                  keyIndex++;
                  // (Logic for key depletion handled in next loop)
              }
              retries = 0;
           }
           await new Promise(res => setTimeout(res, PROCESS_DELAY));
        }
      }
    }
    progressBar.update(i + 1);
  }

  progressBar.stop();
  console.log(`\nDone processing collection: ${collectionSlug}. Progress saved to ${outputPath}`);
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
