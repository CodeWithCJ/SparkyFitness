const { Pool } = require('pg');
require('dotenv').config({ path: '../.env' }); // Load .env from root

const pool = new Pool({
    user: process.env.SPARKY_FITNESS_DB_USER,
    host: process.env.SPARKY_FITNESS_DB_HOST,
    database: process.env.SPARKY_FITNESS_DB_NAME,
    password: process.env.SPARKY_FITNESS_DB_PASSWORD,
    port: process.env.SPARKY_FITNESS_DB_PORT || 5432,
});

async function findToken() {
    const tokenPrefix = 'blHnXfiN'; // From the user's log
    console.log(`Searching for token starting with: ${tokenPrefix}`);

    const client = await pool.connect();
    try {
        // 1. Check api_key table
        const apiKeyRes = await client.query(
            'SELECT * FROM api_key WHERE key LIKE $1 OR key LIKE $2',
            [`${tokenPrefix}%`, `Bearer ${tokenPrefix}%`]
        );
        if (apiKeyRes.rows.length > 0) {
            console.log('FOUND IN api_key table:', apiKeyRes.rows[0]);
        } else {
            console.log('Not found in api_key table.');
        }

        // 2. Check session table (token column)
        const sessionRes = await client.query(
            'SELECT * FROM session WHERE token LIKE $1',
            [`${tokenPrefix}%`]
        );
        if (sessionRes.rows.length > 0) {
            console.log('FOUND IN session table (token column):', sessionRes.rows[0]);
        } else {
            console.log('Not found in session table.');
        }

    } catch (err) {
        console.error('Database query error:', err);
    } finally {
        client.release();
        pool.end();
    }
}

findToken();
