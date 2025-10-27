const fs = require('fs');
const path = require('path');
const { getSystemClient } = require('../db/poolManager');
const { log } = require('../config/logging');

async function applyRlsPolicies() {
  const client = await getSystemClient();
  try {
    log('info', 'Applying all RLS policies from rls_policies.sql...');
    const rlsSqlPath = path.join(__dirname, '../db/rls_policies.sql');
    const rlsSql = fs.readFileSync(rlsSqlPath, 'utf8');
    await client.query(rlsSql);
    log('info', 'Successfully applied all RLS policies.');
  } catch (error) {
    log('error', 'Error applying RLS policies:', error);
    process.exit(1); // Exit if RLS policies cannot be applied
  } finally {
    client.release();
  }
}

module.exports = {
  applyRlsPolicies,
};