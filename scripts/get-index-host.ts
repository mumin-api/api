import { Pinecone } from '@pinecone-database/pinecone';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

async function getIndexHost() {
    const apiKey = process.env.PINECONE_API_KEY;
    if (!apiKey) {
        console.error('PINECONE_API_KEY is missing');
        return;
    }

    const pc = new Pinecone({ apiKey });
    const indexName = 'mumin-v3';

    try {
        const desc = await pc.describeIndex(indexName);
        console.log(`Index: ${indexName}`);
        console.log(`Host: https://${desc.host}`);
        console.log(`Status: ${desc.status.ready ? 'Ready' : 'Not Ready'}`);
    } catch (error: any) {
        console.error('Failed to describe index:', error.message);
    }
}

getIndexHost();
