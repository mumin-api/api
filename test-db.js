const { Client } = require('pg');

async function testConnection(url, name) {
    const client = new Client({ connectionString: url });
    try {
        await client.connect();
        console.log(`[SUCCESS] Connected to ${name}`);
        const res = await client.query('SELECT current_database();');
        console.log(`[INFO] Current database: ${res.rows[0].current_database}`);
        const extRes = await client.query("SELECT name FROM pg_available_extensions WHERE name = 'vector' AND installed_version IS NOT NULL;");
        if (extRes.rows.length > 0) {
            console.log(`[SUCCESS] Extension 'vector' is installed in ${name}`);
        } else {
            console.log(`[FAILURE] Extension 'vector' is NOT installed in ${name}`);
        }
        await client.end();
    } catch (err) {
        console.error(`[FAILURE] ${name}: ${err.message}`);
    }
}

async function run() {
    console.log('Testing connections on port 5434...');
    await testConnection('postgresql://postgres:postgres@localhost:5434/mumin_test', 'Main DB');
    await testConnection('postgresql://postgres:postgres@localhost:5434/mshadow', 'Shadow DB');
}

run();
