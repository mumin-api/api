import { MeiliSearch } from 'meilisearch';
import * as dotenv from 'dotenv';

dotenv.config();

const meilisearch = new MeiliSearch({
    host: process.env.MEILISEARCH_HOST || 'http://localhost:7700',
    apiKey: process.env.MEILISEARCH_API_KEY || 'masterKey',
});

async function checkTasks() {
    try {
        const index = meilisearch.index('hadiths');
        const stats = await index.getStats();
        console.log('\nIndex Stats:');
        console.log(JSON.stringify(stats, null, 2));
    } catch (e) {
        console.error('Error checking Meilisearch:', e);
    }
}

checkTasks();
