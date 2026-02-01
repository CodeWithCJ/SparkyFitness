const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    user: process.env.SPARKY_FITNESS_DB_USER,
    host: process.env.SPARKY_FITNESS_DB_HOST,
    database: process.env.SPARKY_FITNESS_DB_NAME,
    password: process.env.SPARKY_FITNESS_DB_PASSWORD,
    port: process.env.SPARKY_FITNESS_DB_PORT || 5432,
});

async function checkLegacyTables() {
    let client;
    try {
        console.log(`Connecting to: ${process.env.SPARKY_FITNESS_DB_HOST}/${process.env.SPARKY_FITNESS_DB_NAME} as ${process.env.SPARKY_FITNESS_DB_USER}`);
        client = await pool.connect();

        console.log("Checking for 'user_api_keys' table...");
        const res = await client.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = 'user_api_keys';
        `);

        if (res.rowCount > 0) {
            console.log("Table 'user_api_keys' exists.");
            const count = await client.query("SELECT COUNT(*) FROM user_api_keys");
            console.log(`Row count in 'user_api_keys': ${count.rows[0].count}`);
        } else {
            console.log("Table 'user_api_keys' does not exist.");
        }

        console.log("Checking for 'api_key' table...");
        const res2 = await client.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = 'api_key';
        `);
        console.log(`Table 'api_key' exists: ${res2.rowCount > 0}`);

    } catch (err) {
        console.error("Error during check:", err.message);
    } finally {
        if (client) client.release();
        await pool.end();
        console.log("Done.");
        process.exit();
    }
}

checkLegacyTables();
