import fs from 'fs';
import path from 'path';
import type { PoolClient } from 'pg';
import { getSystemClient } from '../db/poolManager.js';
import { log } from '../config/logging.js';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Applies RLS policies; the caller retains any supplied client. */
async function applyRlsPolicies(existingClient: PoolClient | null = null) {
  const client = existingClient || (await getSystemClient());
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
    if (!existingClient) client.release();
  }
}
export { applyRlsPolicies };
export default {
  applyRlsPolicies,
};
