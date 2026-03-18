import { Pinecone } from '@pinecone-database/pinecone';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

async function createIndex() {
    const apiKey = process.env.PINECONE_API_KEY;
    if (!apiKey) {
        console.error('PINECONE_API_KEY is missing');
        return;
    }

    const pc = new Pinecone({ apiKey });
    const indexName = 'mumin-v3';

    console.log(`Creating index "${indexName}" with 3072 dimensions...`);

    try {
        await pc.createIndex({
            name: indexName,
            dimension: 3072,
            metric: 'cosine',
            spec: {
                serverless: {
                    cloud: 'aws',
                    region: 'us-east-1'
                }
            }
        });
        console.log('Index creation initiated. Please wait a few minutes for it to be ready.');
    } catch (error: any) {
        if (error.message?.includes('already exists')) {
            console.log(`Index "${indexName}" already exists.`);
        } else {
            console.error('Failed to create index:', error.message);
        }
    }
}

createIndex();
