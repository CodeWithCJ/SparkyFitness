const { getSystemClient } = require('./db/poolManager');
require('dotenv').config();

async function checkLegacyTables() {
    let client;
    try {
        client = await getSystemClient();
        console.log("Checking for 'user_api_keys' table...");
        const res = await client.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = 'user_api_keys';
        `);

        if (res.rowCount > 0) {
            console.log("Table 'user_api_keys' exists. Schema:");
            const cols = await client.query(`
                SELECT column_name, data_type 
                FROM information_schema.columns 
                WHERE table_name = 'user_api_keys'
                ORDER BY ordinal_position;
            `);
            console.table(cols.rows);

            const count = await client.query("SELECT COUNT(*) FROM user_api_keys");
            console.log(`Row count in 'user_api_keys': ${count.rows[0].count}`);
        } else {
            console.log("Table 'user_api_keys' does not exist.");
        }
    } catch (err) {
        console.error("Error:", err);
    } finally {
        if (client) client.release();
        process.exit();
    }
}

checkLegacyTables();
