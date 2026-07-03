import fs from 'fs';
import path from 'path';
import { getSystemClient } from '../db/poolManager.js';
import { log } from '../config/logging.js';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
    throw error;
  } finally {
    client.release();
  }
}
export { applyRlsPolicies };
export default {
  applyRlsPolicies,
};
