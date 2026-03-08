const { Client } = require('pg');

async function checkStatus() {
    const client = new Client({ connectionString: "postgresql://postgres.klwekjkefkrfnvuathwb:y23_LU2m%3F%21%3FefZa@aws-1-eu-central-1.pooler.supabase.com:5432/postgres" });
    try {
        await client.connect();
        const hadithCount = await client.query('SELECT COUNT(*) FROM hadiths;');
        const collectionCount = await client.query('SELECT COUNT(*) FROM collections;');
        const embeddingCount = await client.query('SELECT COUNT(*) FROM hadiths WHERE embedding IS NOT NULL;');
        
        console.log(`Hadiths: ${hadithCount.rows[0].count}`);
        console.log(`Collections: ${collectionCount.rows[0].count}`);
        console.log(`Hadiths with embeddings: ${embeddingCount.rows[0].count}`);
        
        await client.end();
    } catch (err) {
        console.error(`Error: ${err.message}`);
    }
}

checkStatus();
