import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type { PoolClient } from 'pg';
import { getSystemClient } from '../db/poolManager.js';
import { log } from '../config/logging.js';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Everything rls_policies.sql defines (policies, row security flags, helper
// functions in public), read from the catalogs only. Applying the file takes
// an ACCESS EXCLUSIVE lock on every policy table, while this reads no user
// table at all, so a boot with nothing to change never blocks live requests on
// other instances. It also catches policies changed by hand or lost when a
// migration recreated a table, which a hash of the file alone would miss.
// Function attributes are those CREATE OR REPLACE resets (strictness hides
// rows whose owner column is NULL); the owner is left out because re-applying
// the file cannot change it.
const catalogFingerprintSql = `SELECT encode(sha256(convert_to(concat_ws(E'\\n',
  (SELECT string_agg(row(c.relname, p.polname, p.polcmd, p.polpermissive,
            p.polroles, p.polqual, p.polwithcheck)::text, E'\\n'
          ORDER BY c.relname, p.polname)
     FROM pg_catalog.pg_policy p
     JOIN pg_catalog.pg_class c ON c.oid = p.polrelid
    WHERE c.relnamespace = 'public'::regnamespace),
  (SELECT string_agg(row(c.relname, c.relrowsecurity,
            c.relforcerowsecurity)::text, E'\\n' ORDER BY c.relname)
     FROM pg_catalog.pg_class c
    WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p')),
  (SELECT string_agg(row(p.oid::regprocedure, p.prorettype::regtype,
            p.prokind, p.provolatile, p.proisstrict, p.prosecdef,
            p.proleakproof, p.proparallel, p.proconfig, p.prosrc)::text, E'\\n'
          ORDER BY p.oid::regprocedure::text)
     FROM pg_catalog.pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace)
), 'UTF8')), 'hex')`;

interface RlsApplyOptions {
  /** Policy SQL to apply instead of db/rls_policies.sql. */
  sql?: string;
  lockTimeoutMs?: number;
  retryWindowMs?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
}

type RlsApplyResult = 'current' | 'applied';

// Below PostgreSQL's default deadlock_timeout (1 s): when a live request and
// the apply wait on each other, the apply gives up and rolls back first, so
// the request carries on instead of being chosen as the deadlock victim. It
// also bounds how long readers queue behind an exclusive lock still waiting.
const defaultOptions = {
  lockTimeoutMs: 200,
  retryWindowMs: 30_000,
  initialDelayMs: 100,
  maxDelayMs: 2_000,
};

const lockConflictCodes = new Set(['55P03', '40P01']);

function isLockConflict(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' && lockConflictCodes.has(code);
}

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

function readPolicySql(): string {
  return fs.readFileSync(
    path.join(__dirname, '../db/rls_policies.sql'),
    'utf8'
  );
}

async function policiesAreCurrent(
  client: PoolClient,
  fileSha256: string
): Promise<boolean> {
  const { rows } = await client.query<{ current: boolean }>(
    `SELECT file_sha256 = $1 AND catalog_fingerprint = (${catalogFingerprintSql}) AS current
       FROM system.rls_policy_state WHERE id`,
    [fileSha256]
  );
  return rows[0]?.current === true;
}

/** Applies the file and records it in one transaction, so a failed apply leaves neither. */
function applyQuery(sql: string, fileSha256: string, lockTimeoutMs: number) {
  return `BEGIN;
SET LOCAL lock_timeout = ${Math.max(0, Math.floor(lockTimeoutMs))};
${sql}
;
INSERT INTO system.rls_policy_state (id, file_sha256, catalog_fingerprint, applied_at)
VALUES (TRUE, '${fileSha256}', (${catalogFingerprintSql}), now())
ON CONFLICT (id) DO UPDATE SET file_sha256 = EXCLUDED.file_sha256,
  catalog_fingerprint = EXCLUDED.catalog_fingerprint,
  applied_at = EXCLUDED.applied_at;
COMMIT;`;
}

/**
 * Brings the database's RLS policies in line with rls_policies.sql, applying
 * the file only when it or the policies in the database changed since the last
 * apply. The caller retains any supplied client and must hold the schema
 * initialization lock.
 */
async function applyRlsPolicies(
  existingClient: PoolClient | null = null,
  options: RlsApplyOptions = {}
): Promise<RlsApplyResult> {
  const { lockTimeoutMs, retryWindowMs, initialDelayMs, maxDelayMs } = {
    ...defaultOptions,
    ...options,
  };
  const client = existingClient || (await getSystemClient());
  try {
    const sql = options.sql ?? readPolicySql();
    const fileSha256 = crypto.createHash('sha256').update(sql).digest('hex');
    if (await policiesAreCurrent(client, fileSha256)) {
      log('info', 'RLS policies match rls_policies.sql; nothing to apply.');
      return 'current';
    }

    log('info', 'Applying all RLS policies from rls_policies.sql...');
    const deadline = Date.now() + retryWindowMs;
    let delayMs = initialDelayMs;
    for (let attempt = 1; ; attempt++) {
      // After the retry window, wait for locks as long as it takes rather
      // than fail the boot: policies must match the file before serving.
      const bounded = Date.now() < deadline;
      if (!bounded) {
        log(
          'warn',
          'RLS policy tables stayed busy; applying without a lock timeout.'
        );
      }
      try {
        await client.query(
          applyQuery(sql, fileSha256, bounded ? lockTimeoutMs : 0)
        );
        log('info', 'Successfully applied all RLS policies.');
        return 'applied';
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        // A deadlock can still pick the untimed attempt as its victim; never
        // fail the boot over a lock conflict.
        if (!isLockConflict(error)) throw error;
        log(
          'info',
          `RLS policy apply attempt ${attempt} met a lock held by live requests; retrying in ${delayMs} ms.`
        );
        await sleep(delayMs);
        delayMs = Math.min(delayMs * 2, maxDelayMs);
      }
    }
  } catch (error) {
    log('error', 'Error applying RLS policies:', error);
    throw error;
  } finally {
    if (!existingClient) client.release();
  }
}
export { applyRlsPolicies };
export type { RlsApplyOptions, RlsApplyResult };
export default {
  applyRlsPolicies,
};
