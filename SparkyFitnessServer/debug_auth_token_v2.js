const { Pool } = require('pg');
const path = require('path');
const dotenv = require('dotenv');

// Load .env explicitly
const envPath = path.resolve(__dirname, '../.env');
console.log(`Loading .env from: ${envPath}`);
const result = dotenv.config({ path: envPath });

if (result.error) {
    console.error('Error loading .env file:', result.error);
} else {
    console.log('.env loaded successfully.');
}

console.log('DB Config:', {
    user: process.env.SPARKY_FITNESS_DB_USER,
    host: process.env.SPARKY_FITNESS_DB_HOST,
    database: process.env.SPARKY_FITNESS_DB_NAME,
    port: process.env.SPARKY_FITNESS_DB_PORT
});

const pool = new Pool({
    user: process.env.SPARKY_FITNESS_DB_USER,
    host: process.env.SPARKY_FITNESS_DB_HOST,
    database: process.env.SPARKY_FITNESS_DB_NAME,
    password: process.env.SPARKY_FITNESS_DB_PASSWORD,
    port: process.env.SPARKY_FITNESS_DB_PORT || 5432,
    connectionTimeoutMillis: 5000 // Fail fast
});

async function findToken() {
    const tokenPrefix = 'blHnXfiN'; // From the user's log
    console.log(`Searching for token starting with: ${tokenPrefix}`);

    let client;
    try {
        console.log('Connecting to DB...');
        client = await pool.connect();
        console.log('Connected.');

        // 1. Check api_key table
        console.log('Checking api_key table...');
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
        console.log('Checking session table...');
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
        if (client) client.release();
        await pool.end();
        console.log('Pool ended.');
    }
}

findToken();
