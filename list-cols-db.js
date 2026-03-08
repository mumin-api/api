const { Client } = require('pg');

async function checkCollections() {
    const client = new Client({ connectionString: "postgresql://postgres.klwekjkefkrfnvuathwb:y23_LU2m%3F%21%3FefZa@aws-1-eu-central-1.pooler.supabase.com:5432/postgres" });
    try {
        await client.connect();
        const res = await client.query('SELECT slug, name_english FROM collections;');
        console.log(JSON.stringify(res.rows));
        await client.end();
    } catch (err) {
        console.error(`Error: ${err.message}`);
    }
}

checkCollections();
