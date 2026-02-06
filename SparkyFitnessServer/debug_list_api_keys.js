const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const pool = new Pool({
    user: process.env.SPARKY_FITNESS_DB_USER,
    host: process.env.SPARKY_FITNESS_DB_HOST,
    database: process.env.SPARKY_FITNESS_DB_NAME,
    password: process.env.SPARKY_FITNESS_DB_PASSWORD,
    port: process.env.SPARKY_FITNESS_DB_PORT || 5432,
});

async function listKeys() {
    const client = await pool.connect();
    try {
        const res = await client.query('SELECT id, key, prefix, enabled, expires_at, user_id FROM api_key');
        console.log(`Found ${res.rows.length} API keys:`);
        res.rows.forEach(row => {
            const keyStart = row.key ? row.key.substring(0, 15) + '...' : 'NULL';
            console.log(`- ID: ${row.id}, KeyStart: ${keyStart}, Prefix: ${row.prefix}, User: ${row.user_id}, Enabled: ${row.enabled}`);
        });
    } catch (err) {
        console.error(err);
    } finally {
        client.release();
        pool.end();
    }
}
listKeys();
